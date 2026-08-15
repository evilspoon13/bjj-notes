"""Technique routes: listing, search, sort, editing, and deletion."""

from __future__ import annotations

import sqlite3

import pytest
from fastapi.testclient import TestClient

from app.models import StructuredSession, StructuredTechnique
from app.repositories import sessions as sessions_repo


def _seed(conn: sqlite3.Connection) -> None:
    """Two sessions sharing one technique, so pruning has something to weigh."""
    sessions_repo.persist_session(
        conn,
        raw_transcript="First session.",
        structured=StructuredSession(
            title="Kimura trap entries",
            techniques=[
                StructuredTechnique(name="Kimura trap", category="Submission", session_notes="a"),
                StructuredTechnique(name="Berimbolo", category="Guard", session_notes="b"),
            ],
        ),
        created_at="2026-01-01T00:00:00+00:00",
    )
    sessions_repo.persist_session(
        conn,
        raw_transcript="Second session.",
        structured=StructuredSession(
            title="More kimura",
            techniques=[StructuredTechnique(name="kimura trap", session_notes="c")],
        ),
        created_at="2026-02-01T00:00:00+00:00",
    )
    conn.commit()


@pytest.fixture
def seeded(conn: sqlite3.Connection) -> sqlite3.Connection:
    _seed(conn)
    return conn


def test_empty_library(client: TestClient) -> None:
    assert client.get("/api/techniques").json() == []


def test_list_techniques(client: TestClient, seeded: sqlite3.Connection) -> None:
    body = client.get("/api/techniques").json()
    assert {t["name"] for t in body} == {"Kimura trap", "Berimbolo"}

    kimura = next(t for t in body if t["name"] == "Kimura trap")
    assert kimura["times_trained"] == 2
    assert kimura["category"] == "Submission"
    assert kimura["first_seen"] == "2026-01-01T00:00:00+00:00"
    assert kimura["last_seen"] == "2026-02-01T00:00:00+00:00"


def test_sort_orders(client: TestClient, seeded: sqlite3.Connection) -> None:
    by_name = [t["name"] for t in client.get("/api/techniques?sort=name").json()]
    assert by_name == ["Berimbolo", "Kimura trap"]

    by_freq = [t["name"] for t in client.get("/api/techniques?sort=frequency").json()]
    assert by_freq[0] == "Kimura trap"

    by_recency = [t["name"] for t in client.get("/api/techniques?sort=recency").json()]
    assert by_recency[0] == "Kimura trap"


def test_invalid_sort_is_rejected(client: TestClient) -> None:
    assert client.get("/api/techniques?sort=; DROP TABLE techniques").status_code == 422


def test_search_is_case_insensitive(client: TestClient, seeded: sqlite3.Connection) -> None:
    assert [t["name"] for t in client.get("/api/techniques?search=KIMURA").json()] == [
        "Kimura trap"
    ]
    assert client.get("/api/techniques?search=nothing here").json() == []


def test_technique_detail_lists_its_sessions(
    client: TestClient, seeded: sqlite3.Connection
) -> None:
    technique_id = next(
        t["id"] for t in client.get("/api/techniques").json() if t["name"] == "Kimura trap"
    )

    body = client.get(f"/api/techniques/{technique_id}").json()
    assert body["name"] == "Kimura trap"
    assert len(body["sessions"]) == 2
    # Newest first, and each carries a readable title.
    assert body["sessions"][0]["title"] == "More kimura"
    assert body["sessions"][0]["notes"] == "c"


def test_update_technique(client: TestClient, seeded: sqlite3.Connection) -> None:
    technique_id = client.get("/api/techniques?sort=name").json()[0]["id"]

    body = client.patch(
        f"/api/techniques/{technique_id}",
        json={
            "name": "Berimbolo (reverse)",
            "category": "Guard",
            "position": "De la Riva",
            "description": "Notes typed by hand.",
        },
    ).json()

    assert body["name"] == "Berimbolo (reverse)"
    assert body["position"] == "De la Riva"
    assert body["description"] == "Notes typed by hand."


def test_rename_onto_existing_name_is_409(
    client: TestClient, seeded: sqlite3.Connection
) -> None:
    berimbolo = client.get("/api/techniques?sort=name").json()[0]["id"]

    response = client.patch(
        f"/api/techniques/{berimbolo}",
        json={"name": "  KIMURA   TRAP  ", "category": None, "position": None, "description": None},
    )
    assert response.status_code == 409
    assert "already named" in response.json()["detail"]


def test_rename_to_own_name_is_allowed(client: TestClient, seeded: sqlite3.Connection) -> None:
    technique_id = client.get("/api/techniques?sort=name").json()[0]["id"]
    response = client.patch(
        f"/api/techniques/{technique_id}",
        json={"name": "Berimbolo", "category": None, "position": None, "description": "x"},
    )
    assert response.status_code == 200


def test_delete_technique_leaves_sessions_intact(
    client: TestClient, seeded: sqlite3.Connection
) -> None:
    technique_id = next(
        t["id"] for t in client.get("/api/techniques").json() if t["name"] == "Kimura trap"
    )

    assert client.delete(f"/api/techniques/{technique_id}").status_code == 204
    assert client.get(f"/api/techniques/{technique_id}").status_code == 404

    # The sessions survive; the technique is simply gone from them.
    sessions = client.get("/api/sessions").json()
    assert len(sessions) == 2
    detail = client.get(f"/api/sessions/{sessions[0]['id']}").json()
    assert "Kimura trap" not in [t["name"] for t in detail["techniques"]]


def test_missing_technique_is_404(client: TestClient) -> None:
    assert client.get("/api/techniques/999").status_code == 404
    assert client.delete("/api/techniques/999").status_code == 404
    assert (
        client.patch(
            "/api/techniques/999",
            json={"name": "x", "category": None, "position": None, "description": None},
        ).status_code
        == 404
    )


def test_techniques_require_key(client: TestClient) -> None:
    assert client.get("/api/techniques", headers={"X-BJJ-Key": ""}).status_code == 401
