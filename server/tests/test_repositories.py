"""Dedup upsert and the orphan-pruning delete, at the repository level."""

from __future__ import annotations

import sqlite3

from app.models import StructuredSession, StructuredTechnique
from app.repositories import sessions as sessions_repo
from app.repositories.techniques import list_technique_names


def _structured(*names: str, title: str = "Session") -> StructuredSession:
    return StructuredSession(
        title=title,
        summary="A session.",
        techniques=[StructuredTechnique(name=n, session_notes=f"notes for {n}") for n in names],
    )


def _technique_names(conn: sqlite3.Connection) -> list[str]:
    return [row["name"] for row in conn.execute("SELECT name FROM techniques ORDER BY name")]


def test_persist_creates_techniques(conn: sqlite3.Connection) -> None:
    sessions_repo.persist_session(
        conn, raw_transcript="t", structured=_structured("Armbar", "Triangle")
    )
    assert _technique_names(conn) == ["Armbar", "Triangle"]


def test_dedup_is_case_and_space_insensitive(conn: sqlite3.Connection) -> None:
    sessions_repo.persist_session(conn, raw_transcript="t1", structured=_structured("Armbar"))
    sessions_repo.persist_session(
        conn, raw_transcript="t2", structured=_structured("  armbar  ")
    )

    assert _technique_names(conn) == ["Armbar"]
    row = conn.execute("SELECT times_trained FROM techniques").fetchone()
    assert row["times_trained"] == 2


def test_technique_repeated_in_one_note_counts_once(conn: sqlite3.Connection) -> None:
    sessions_repo.persist_session(
        conn, raw_transcript="t", structured=_structured("Armbar", "armbar")
    )
    row = conn.execute("SELECT times_trained FROM techniques").fetchone()
    assert row["times_trained"] == 1


def test_list_technique_names_feeds_the_prompt(conn: sqlite3.Connection) -> None:
    sessions_repo.persist_session(
        conn, raw_transcript="t", structured=_structured("Berimbolo", "Armbar")
    )
    assert list_technique_names(conn) == ["Armbar", "Berimbolo"]


def test_delete_prunes_orphaned_techniques(conn: sqlite3.Connection) -> None:
    session_id = sessions_repo.persist_session(
        conn, raw_transcript="t", structured=_structured("Armbar")
    )

    sessions_repo.delete_session(conn, session_id)

    assert _technique_names(conn) == []


def test_delete_keeps_techniques_used_elsewhere(conn: sqlite3.Connection) -> None:
    first = sessions_repo.persist_session(
        conn, raw_transcript="t1", structured=_structured("Armbar"), created_at="2026-01-01"
    )
    sessions_repo.persist_session(
        conn, raw_transcript="t2", structured=_structured("Armbar"), created_at="2026-02-01"
    )

    sessions_repo.delete_session(conn, first)

    row = conn.execute("SELECT name, times_trained, first_seen, last_seen FROM techniques").fetchone()
    assert row["name"] == "Armbar"
    # Counters recomputed from what actually remains, not blindly decremented.
    assert row["times_trained"] == 1
    assert row["first_seen"] == "2026-02-01"
    assert row["last_seen"] == "2026-02-01"


def test_delete_cascades_join_rows(conn: sqlite3.Connection) -> None:
    keep = sessions_repo.persist_session(
        conn, raw_transcript="t1", structured=_structured("Armbar")
    )
    drop = sessions_repo.persist_session(
        conn, raw_transcript="t2", structured=_structured("Armbar", "Triangle")
    )

    sessions_repo.delete_session(conn, drop)

    rows = conn.execute("SELECT session_id FROM session_techniques").fetchall()
    assert [r["session_id"] for r in rows] == [keep]
    assert _technique_names(conn) == ["Armbar"]
