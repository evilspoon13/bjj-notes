"""Full-database JSON export.

The database lives on a single Fly volume, so durability is ours to handle. This
makes a backup one authenticated request, and gives the data a portable shape if
the storage layer is ever swapped (Turso, Postgres, another app entirely).

The export is deliberately self-contained: raw transcripts included, techniques
with their per-session notes, no ids required to reconstruct meaning.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from typing import Any

from . import db
from .repositories.sequences import list_sequences
from .repositories.sessions import get_session, list_sessions
from .repositories.techniques import list_techniques

EXPORT_FORMAT_VERSION = 1


def build_export(conn: sqlite3.Connection) -> dict[str, Any]:
    """Everything in the database, as plain JSON-serializable structures."""
    sessions = [
        get_session(conn, item.id).model_dump()  # type: ignore[union-attr]
        for item in list_sessions(conn)
    ]

    return {
        "format_version": EXPORT_FORMAT_VERSION,
        "schema_version": db.LATEST_VERSION,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "counts": {
            "sessions": len(sessions),
            "techniques": len(list_techniques(conn)),
            "sequences": len(list_sequences(conn)),
        },
        "sessions": sessions,
        "techniques": [t.model_dump() for t in list_techniques(conn, sort="name")],
        # Also nested inside each session; repeated flat so the export stands
        # alone as a browsable record.
        "sequences": [s.model_dump() for s in list_sequences(conn)],
    }
