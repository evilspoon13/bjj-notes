"""The export endpoint — this is the backup, so it must be complete."""

from __future__ import annotations

import sqlite3

import pytest
from fastapi.testclient import TestClient

from app.models import Round, StructuredSession, StructuredTechnique
from app.repositories import sessions as sessions_repo

TRANSCRIPT = "Drilled the kimura trap, then rolled with Dave."


@pytest.fixture
def seeded(conn: sqlite3.Connection) -> sqlite3.Connection:
    sessions_repo.persist_session(
        conn,
        raw_transcript=TRANSCRIPT,
        structured=StructuredSession(
            title="Kimura trap entries",
            summary="Drilled kimura trap entries.",
            went_well=["Grip timing"],
            to_improve=["Hip position"],
            tags=["kimura"],
            rounds=[Round(partner="Dave", outcome="submitted", notes="caught the trap")],
            techniques=[
                StructuredTechnique(
                    name="Kimura trap",
                    category="Submission",
                    position="Half guard",
                    session_notes="Off the single leg.",
                )
            ],
        ),
        created_at="2026-01-01T00:00:00+00:00",
    )
    conn.commit()
    return conn


def test_export_of_empty_database(client: TestClient) -> None:
    body = client.get("/api/export").json()
    assert body["counts"] == {"sessions": 0, "techniques": 0}
    assert body["sessions"] == []
    assert body["techniques"] == []
    assert body["format_version"] == 1


def test_export_contains_everything(client: TestClient, seeded: sqlite3.Connection) -> None:
    body = client.get("/api/export").json()

    assert body["counts"] == {"sessions": 1, "techniques": 1}
    assert body["exported_at"]
    assert body["schema_version"] >= 1

    session = body["sessions"][0]
    # The transcript is the irreplaceable part — it must be in the backup.
    assert session["raw_transcript"] == TRANSCRIPT
    assert session["title"] == "Kimura trap entries"
    assert session["went_well"] == ["Grip timing"]
    assert session["rounds"][0]["partner"] == "Dave"
    assert session["techniques"][0]["name"] == "Kimura trap"

    technique = body["techniques"][0]
    assert technique["name"] == "Kimura trap"
    assert technique["times_trained"] == 1
    assert technique["description"] == "Off the single leg."


def test_export_is_downloadable(client: TestClient, seeded: sqlite3.Connection) -> None:
    response = client.get("/api/export")
    disposition = response.headers["content-disposition"]
    assert disposition.startswith("attachment;")
    assert "bjj-notes-" in disposition and disposition.endswith('.json"')


def test_export_requires_key(client: TestClient) -> None:
    assert client.get("/api/export", headers={"X-BJJ-Key": ""}).status_code == 401
