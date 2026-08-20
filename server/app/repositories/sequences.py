"""Sequence queries.

Sequences are per-session and lossless — describing the same entry twice keeps
both records, unlike techniques which dedup into a library. Every read joins
back to `sessions` so a sequence carries its own date and context in a flat list.
"""

from __future__ import annotations

import json
import sqlite3

from ..models import Sequence
from ..text import derive_title, normalize_name

# Shared projection: sequence columns plus the session context and the linked
# technique's name.
_SELECT = """
SELECT q.id, q.session_id, q.name, q.steps, q.position, q.technique_id,
       q.notes, t.name AS technique_name,
       s.created_at, s.title AS session_title_raw, s.summary, s.raw_transcript
  FROM sequences q
  JOIN sessions s ON s.id = q.session_id
  LEFT JOIN techniques t ON t.id = q.technique_id
"""


def _map(row: sqlite3.Row) -> Sequence:
    try:
        steps = json.loads(row["steps"])
    except json.JSONDecodeError:
        steps = []

    return Sequence(
        id=row["id"],
        session_id=row["session_id"],
        session_title=derive_title(
            row["session_title_raw"], row["summary"], row["raw_transcript"]
        ),
        created_at=row["created_at"],
        name=row["name"],
        steps=[s for s in steps if isinstance(s, str)],
        position=row["position"],
        technique_id=row["technique_id"],
        technique_name=row["technique_name"],
        notes=row["notes"],
    )


def list_sequences(
    conn: sqlite3.Connection, *, search: str | None = None
) -> list[Sequence]:
    """Every sequence, newest first. Search covers the name and the steps."""
    if search and search.strip():
        term = f"%{normalize_name(search)}%"
        rows = conn.execute(
            f"""{_SELECT}
             WHERE LOWER(q.name) LIKE ?
                OR LOWER(q.steps) LIKE ?
                OR LOWER(COALESCE(t.name, '')) LIKE ?
             ORDER BY s.created_at DESC, q.id
            """,
            (term, term, term),
        ).fetchall()
    else:
        rows = conn.execute(
            f"{_SELECT} ORDER BY s.created_at DESC, q.id"
        ).fetchall()

    return [_map(row) for row in rows]


def get_sequence(conn: sqlite3.Connection, sequence_id: int) -> Sequence | None:
    row = conn.execute(f"{_SELECT} WHERE q.id = ?", (sequence_id,)).fetchone()
    return _map(row) if row else None


def list_for_session(conn: sqlite3.Connection, session_id: int) -> list[Sequence]:
    rows = conn.execute(
        f"{_SELECT} WHERE q.session_id = ? ORDER BY q.id", (session_id,)
    ).fetchall()
    return [_map(row) for row in rows]


def list_for_technique(conn: sqlite3.Connection, technique_id: int) -> list[Sequence]:
    """The ways the user has arrived at a technique, newest first."""
    rows = conn.execute(
        f"{_SELECT} WHERE q.technique_id = ? ORDER BY s.created_at DESC, q.id",
        (technique_id,),
    ).fetchall()
    return [_map(row) for row in rows]


def delete_sequence(conn: sqlite3.Connection, sequence_id: int) -> bool:
    cursor = conn.execute("DELETE FROM sequences WHERE id = ?", (sequence_id,))
    return cursor.rowcount > 0


def insert_sequence(
    conn: sqlite3.Connection,
    *,
    session_id: int,
    name: str,
    steps: list[str],
    position: str | None,
    technique_id: int | None,
    notes: str | None,
) -> int:
    cursor = conn.execute(
        """
        INSERT INTO sequences (session_id, name, steps, position, technique_id, notes)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (session_id, name.strip(), json.dumps(steps), position, technique_id, notes),
    )
    return int(cursor.lastrowid)
