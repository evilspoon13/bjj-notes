"""Technique library queries and the dedup upsert.

Dedup key is `name_norm` (lowercased/trimmed/whitespace-collapsed). The LLM is
already asked to reuse canonical names; this normalization is the safety net that
catches casing and spacing variants of the same name.
"""

from __future__ import annotations

import sqlite3
from typing import Literal

from ..models import Technique, TechniqueDetail, TechniqueSession, TechniqueUpdate
from ..text import derive_title, normalize_name

TechniqueSort = Literal["recency", "frequency", "name"]

# Whitelisted so the sort key can never reach the query as raw input.
_ORDER_BY: dict[str, str] = {
    "recency": "last_seen DESC",
    "frequency": "times_trained DESC, last_seen DESC",
    "name": "name COLLATE NOCASE ASC",
}


class DuplicateTechniqueError(Exception):
    """Raised when a rename collides with another technique's normalized name."""

    def __init__(self, name: str) -> None:
        super().__init__(f"Another technique is already named “{name}”.")
        self.name = name


def list_techniques(
    conn: sqlite3.Connection,
    *,
    search: str | None = None,
    sort: TechniqueSort = "recency",
) -> list[Technique]:
    order_by = _ORDER_BY[sort]

    if search and search.strip():
        rows = conn.execute(
            f"SELECT * FROM techniques WHERE name_norm LIKE ? ORDER BY {order_by}",
            (f"%{normalize_name(search)}%",),
        ).fetchall()
    else:
        rows = conn.execute(f"SELECT * FROM techniques ORDER BY {order_by}").fetchall()

    return [Technique.model_validate(dict(row)) for row in rows]


def get_technique(conn: sqlite3.Connection, technique_id: int) -> TechniqueDetail | None:
    row = conn.execute(
        "SELECT * FROM techniques WHERE id = ?", (technique_id,)
    ).fetchone()
    if row is None:
        return None

    return TechniqueDetail(
        **{k: row[k] for k in row.keys() if k != "name_norm"},
        sessions=get_technique_sessions(conn, technique_id),
    )


def get_technique_sessions(
    conn: sqlite3.Connection, technique_id: int
) -> list[TechniqueSession]:
    """Sessions in which a technique appeared, newest first."""
    rows = conn.execute(
        """
        SELECT s.id AS session_id, s.created_at, s.title, s.summary,
               s.raw_transcript, st.notes
          FROM session_techniques st
          JOIN sessions s ON s.id = st.session_id
         WHERE st.technique_id = ?
         ORDER BY s.created_at DESC
        """,
        (technique_id,),
    ).fetchall()

    return [
        TechniqueSession(
            session_id=row["session_id"],
            created_at=row["created_at"],
            title=derive_title(row["title"], row["summary"], row["raw_transcript"]),
            notes=row["notes"],
        )
        for row in rows
    ]


def update_technique(
    conn: sqlite3.Connection, technique_id: int, fields: TechniqueUpdate
) -> bool:
    """Update user-editable fields. Returns False if the technique is missing.

    Renaming recomputes `name_norm`; if that collides with a different technique
    the UNIQUE constraint fires and we surface a friendly error.
    """
    name = fields.name.strip()
    try:
        cursor = conn.execute(
            """
            UPDATE techniques
               SET name = ?, name_norm = ?, category = ?, position = ?, description = ?
             WHERE id = ?
            """,
            (
                name,
                normalize_name(name),
                fields.category,
                fields.position,
                fields.description,
                technique_id,
            ),
        )
    except sqlite3.IntegrityError as exc:
        raise DuplicateTechniqueError(name) from exc

    return cursor.rowcount > 0


def delete_technique(conn: sqlite3.Connection, technique_id: int) -> bool:
    """Remove a technique from the library.

    Its `session_techniques` rows cascade, so it disappears from the sessions
    that mentioned it; the sessions and their transcripts are untouched.
    """
    cursor = conn.execute("DELETE FROM techniques WHERE id = ?", (technique_id,))
    return cursor.rowcount > 0


def list_technique_names(conn: sqlite3.Connection) -> list[str]:
    """Canonical names passed to the LLM so it reuses them instead of inventing."""
    rows = conn.execute(
        "SELECT name FROM techniques ORDER BY name COLLATE NOCASE"
    ).fetchall()
    return [row["name"] for row in rows]


def upsert_technique(
    conn: sqlite3.Connection,
    *,
    name: str,
    category: str | None,
    position: str | None,
    description: str | None,
    now: str,
) -> int:
    """Insert or update a technique by normalized name and return its id.

    New technique: inserted with `times_trained = 1` and `first_seen = last_seen`.
    Existing: `times_trained += 1`, `last_seen = now`, and any previously-empty
    category/position/description is backfilled.

    Runs inside the caller's transaction (see `sessions.persist_session`).
    """
    name_norm = normalize_name(name)
    existing = conn.execute(
        "SELECT id FROM techniques WHERE name_norm = ?", (name_norm,)
    ).fetchone()

    if existing:
        conn.execute(
            """
            UPDATE techniques
               SET times_trained = times_trained + 1,
                   last_seen = ?,
                   category = COALESCE(category, ?),
                   position = COALESCE(position, ?),
                   description = COALESCE(description, ?)
             WHERE id = ?
            """,
            (now, category, position, description, existing["id"]),
        )
        return int(existing["id"])

    cursor = conn.execute(
        """
        INSERT INTO techniques
            (name, name_norm, category, position, description,
             times_trained, first_seen, last_seen)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        """,
        (name.strip(), name_norm, category, position, description, now, now),
    )
    return int(cursor.lastrowid)
