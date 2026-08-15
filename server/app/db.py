"""SQLite connection management and schema migrations.

Migrations are versioned with SQLite's `user_version` pragma. Additive column
changes are also reconciled against `PRAGMA table_info` on every open: a version
counter can advance without the ALTER actually landing on the connection the app
uses, and a version-only scheme cannot recover from that state. The React Native
app hit exactly this, so the web version guards against it from the start.

One connection per request. SQLite connections are not safe to share across
threads, and opening one is cheap.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from . import config

# Bump this and add a migration block in `migrate` when the schema changes.
LATEST_VERSION = 1

_SCHEMA_V1 = """
CREATE TABLE IF NOT EXISTS sessions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at     TEXT NOT NULL,
  raw_transcript TEXT NOT NULL,
  title          TEXT,
  summary        TEXT,
  went_well      TEXT,
  to_improve     TEXT,
  rounds         TEXT,
  tags           TEXT
);

CREATE TABLE IF NOT EXISTS techniques (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  name_norm     TEXT NOT NULL UNIQUE,
  category      TEXT,
  position      TEXT,
  description   TEXT,
  times_trained INTEGER NOT NULL DEFAULT 0,
  first_seen    TEXT NOT NULL,
  last_seen     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_techniques (
  session_id   INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  technique_id INTEGER NOT NULL REFERENCES techniques(id) ON DELETE CASCADE,
  notes        TEXT,
  PRIMARY KEY (session_id, technique_id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_st_technique ON session_techniques(technique_id);
"""


def connect(path: Path | None = None) -> sqlite3.Connection:
    """Open a connection with the pragmas this app depends on."""
    db_path = path or config.DATABASE_PATH
    if db_path != Path(":memory:"):
        db_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(db_path, timeout=10.0)
    conn.row_factory = sqlite3.Row
    # Not persisted by the pragma — must be set on every connection.
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def _has_column(conn: sqlite3.Connection, table: str, column: str) -> bool:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(row["name"] == column for row in rows)


def _add_column_if_missing(
    conn: sqlite3.Connection, table: str, column: str, type_: str
) -> None:
    """Add a column only if it is missing, so the call is safe to repeat."""
    if _has_column(conn, table, column):
        return
    conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {type_}")


def migrate(conn: sqlite3.Connection) -> None:
    """Bring the database up to LATEST_VERSION. Safe to run on every startup."""
    conn.execute("PRAGMA journal_mode = WAL")
    version = conn.execute("PRAGMA user_version").fetchone()[0]

    if version == 0:
        conn.executescript(_SCHEMA_V1)
        version = 1

    # Future migrations: `if version == 1: ...; version = 2`

    # Reconcile additive columns regardless of user_version. See module docstring.
    _add_column_if_missing(conn, "sessions", "title", "TEXT")

    conn.execute(f"PRAGMA user_version = {LATEST_VERSION}")
    conn.commit()


@contextmanager
def session_scope(path: Path | None = None) -> Iterator[sqlite3.Connection]:
    """Connection context manager: commits on success, rolls back on error."""
    conn = connect(path)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_db() -> Iterator[sqlite3.Connection]:
    """FastAPI dependency yielding a per-request connection."""
    with session_scope() as conn:
        yield conn
