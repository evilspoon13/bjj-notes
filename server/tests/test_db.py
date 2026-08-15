"""Schema and migration behavior."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from app import db as db_module


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}


def test_migrate_creates_schema(conn: sqlite3.Connection) -> None:
    tables = {
        row["name"]
        for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
    }
    assert {"sessions", "techniques", "session_techniques"} <= tables
    assert "title" in _columns(conn, "sessions")
    assert conn.execute("PRAGMA user_version").fetchone()[0] == db_module.LATEST_VERSION


def test_migrate_is_idempotent(conn: sqlite3.Connection) -> None:
    db_module.migrate(conn)
    db_module.migrate(conn)
    assert "title" in _columns(conn, "sessions")


def test_migrate_repairs_version_ahead_of_schema(db_path: Path) -> None:
    """A DB marked current but missing an additive column must self-heal.

    This is the failure the React Native app hit: `user_version` advanced while
    the ALTER never landed, and the version-gated block could never run again.
    """
    conn = db_module.connect(db_path)
    conn.executescript(
        """
        CREATE TABLE sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at TEXT NOT NULL,
          raw_transcript TEXT NOT NULL,
          summary TEXT, went_well TEXT, to_improve TEXT, rounds TEXT, tags TEXT
        );
        """
    )
    conn.execute(f"PRAGMA user_version = {db_module.LATEST_VERSION}")
    conn.commit()
    assert "title" not in _columns(conn, "sessions")

    db_module.migrate(conn)

    assert "title" in _columns(conn, "sessions")
    conn.close()


def test_foreign_keys_enabled(conn: sqlite3.Connection) -> None:
    assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
