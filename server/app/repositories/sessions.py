"""Session journal queries and the persist transaction.

JSON-array columns (`went_well`, `to_improve`, `rounds`, `tags`) are stored as
TEXT and decoded here, mirroring the React Native app's `db/sessions.ts`.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone

from ..models import (
    Round,
    Session,
    SessionListItem,
    SessionTechnique,
    SessionUpdate,
    StructuredSession,
)
from ..text import derive_title, normalize_name, to_title
from .techniques import upsert_technique


def _parse_str_list(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return []
    return [item for item in value if isinstance(item, str)] if isinstance(value, list) else []


def _parse_rounds(raw: str | None) -> list[Round]:
    if not raw:
        return []
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(value, list):
        return []
    return [Round.model_validate(item) for item in value if isinstance(item, dict)]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def list_sessions(conn: sqlite3.Connection) -> list[SessionListItem]:
    """Reverse-chronological list for the journal."""
    rows = conn.execute(
        """
        SELECT id, created_at, title, summary, tags, raw_transcript
          FROM sessions
         ORDER BY created_at DESC
        """
    ).fetchall()
    return [
        SessionListItem(
            id=row["id"],
            created_at=row["created_at"],
            title=derive_title(row["title"], row["summary"], row["raw_transcript"]),
            summary=row["summary"],
            tags=_parse_str_list(row["tags"]),
        )
        for row in rows
    ]


def get_session(conn: sqlite3.Connection, session_id: int) -> Session | None:
    row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
    if row is None:
        return None

    return Session(
        id=row["id"],
        created_at=row["created_at"],
        raw_transcript=row["raw_transcript"],
        title=derive_title(row["title"], row["summary"], row["raw_transcript"]),
        summary=row["summary"],
        went_well=_parse_str_list(row["went_well"]),
        to_improve=_parse_str_list(row["to_improve"]),
        rounds=_parse_rounds(row["rounds"]),
        tags=_parse_str_list(row["tags"]),
        techniques=get_session_techniques(conn, session_id),
    )


def get_session_techniques(
    conn: sqlite3.Connection, session_id: int
) -> list[SessionTechnique]:
    rows = conn.execute(
        """
        SELECT t.id AS technique_id, t.name, t.category, t.position, st.notes
          FROM session_techniques st
          JOIN techniques t ON t.id = st.technique_id
         WHERE st.session_id = ?
         ORDER BY t.name COLLATE NOCASE
        """,
        (session_id,),
    ).fetchall()
    return [SessionTechnique.model_validate(dict(row)) for row in rows]


def update_session(
    conn: sqlite3.Connection, session_id: int, fields: SessionUpdate
) -> bool:
    """Update the user-editable fields. Returns False if the session is missing."""
    cursor = conn.execute(
        """
        UPDATE sessions
           SET title = ?, summary = ?, went_well = ?, to_improve = ?, tags = ?
         WHERE id = ?
        """,
        (
            to_title(fields.title) if fields.title else None,
            fields.summary,
            json.dumps(fields.went_well),
            json.dumps(fields.to_improve),
            json.dumps(fields.tags),
            session_id,
        ),
    )
    return cursor.rowcount > 0


def delete_session(conn: sqlite3.Connection, session_id: int) -> bool:
    """Delete a session and the library techniques it brought in.

    `session_techniques` rows cascade. A technique may be linked to several
    sessions, so only the ones left with no remaining session are removed;
    survivors have their counters recomputed from the rows that are actually
    left, which is self-healing in a way `times_trained - 1` would not be.
    """
    linked = [
        row["technique_id"]
        for row in conn.execute(
            "SELECT technique_id FROM session_techniques WHERE session_id = ?",
            (session_id,),
        ).fetchall()
    ]

    cursor = conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
    if cursor.rowcount == 0:
        return False

    for technique_id in linked:
        remaining = conn.execute(
            "SELECT COUNT(*) AS n FROM session_techniques WHERE technique_id = ?",
            (technique_id,),
        ).fetchone()["n"]

        if remaining == 0:
            conn.execute("DELETE FROM techniques WHERE id = ?", (technique_id,))
            continue

        conn.execute(
            """
            UPDATE techniques
               SET times_trained = (
                     SELECT COUNT(*) FROM session_techniques
                      WHERE technique_id = techniques.id
                   ),
                   first_seen = COALESCE((
                     SELECT MIN(s.created_at) FROM session_techniques st
                       JOIN sessions s ON s.id = st.session_id
                      WHERE st.technique_id = techniques.id
                   ), first_seen),
                   last_seen = COALESCE((
                     SELECT MAX(s.created_at) FROM session_techniques st
                       JOIN sessions s ON s.id = st.session_id
                      WHERE st.technique_id = techniques.id
                   ), last_seen)
             WHERE id = ?
            """,
            (technique_id,),
        )

    return True


def persist_session(
    conn: sqlite3.Connection,
    *,
    raw_transcript: str,
    structured: StructuredSession,
    created_at: str | None = None,
) -> int:
    """Write a structured session and fold its techniques into the library.

    Returns the new session id. The caller's connection provides the transaction.
    """
    now = created_at or _now()

    cursor = conn.execute(
        """
        INSERT INTO sessions
            (created_at, raw_transcript, title, summary,
             went_well, to_improve, rounds, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            now,
            raw_transcript,
            structured.title.strip() or None,
            structured.summary or None,
            json.dumps(structured.went_well),
            json.dumps(structured.to_improve),
            json.dumps([r.model_dump() for r in structured.rounds]),
            json.dumps(structured.tags),
        ),
    )
    session_id = int(cursor.lastrowid)

    # Dedup within this single note, so we neither violate the join table's PK
    # nor double-count `times_trained`. The check must come BEFORE the upsert:
    # upserting first would bump the counter for each mention even though only
    # one join row is written.
    seen: set[str] = set()
    for technique in structured.techniques:
        if not technique.name.strip():
            continue

        name_norm = normalize_name(technique.name)
        if name_norm in seen:
            continue  # same technique mentioned twice in one debrief
        seen.add(name_norm)

        technique_id = upsert_technique(
            conn,
            name=technique.name,
            category=technique.category or None,
            position=technique.position,
            description=technique.session_notes or None,
            now=now,
        )

        conn.execute(
            "INSERT INTO session_techniques (session_id, technique_id, notes)"
            " VALUES (?, ?, ?)",
            (session_id, technique_id, technique.session_notes or None),
        )

    return session_id
