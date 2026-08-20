"""Adding techniques directly, outside a session.

The load-bearing guarantee here: authoring a technique that already exists must
never overwrite detail you already wrote.
"""

from __future__ import annotations

import sqlite3

import pytest
from fastapi.testclient import TestClient

from app import config, groq
from app.groq import normalize_technique
from app.models import StructuredTechnique, StructuredTechniqueDetail, StructuredSession
from app.repositories import sessions as sessions_repo
from app.repositories.techniques import create_or_enrich_technique, get_technique

WRITE_UP = (
    "The kimura from half guard. Get the far collar grip, trap the arm, "
    "figure-four the wrist. Keep your elbow tight or they slip out."
)


def _detail(**overrides) -> StructuredTechniqueDetail:
    defaults = {
        "name": "Kimura from half guard",
        "category": "Submission",
        "position": "Half guard",
        "description": "A shoulder lock from half guard.",
        "steps": ["grip the far collar", "trap the arm", "figure-four the wrist"],
        "key_details": ["keep the elbow tight to your body"],
        "tips": ["if they straighten the arm, switch to the armbar"],
    }
    return StructuredTechniqueDetail(**{**defaults, **overrides})


@pytest.fixture(autouse=True)
def stub_groq(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "GROQ_API_KEY", "test-key")
    monkeypatch.setattr(groq, "structure_technique", lambda *a, **kw: _detail())


# --- model output coercion --------------------------------------------------


def test_normalize_technique_parses_sections() -> None:
    result = normalize_technique(
        {
            "name": "  Kimura  ",
            "category": "Submission",
            "position": "Half guard",
            "description": "A shoulder lock.",
            "steps": ["a", "b"],
            "key_details": ["c"],
            "tips": ["d"],
        }
    )
    assert result.name == "Kimura"
    assert result.steps == ["a", "b"]
    assert result.key_details == ["c"]
    assert result.tips == ["d"]


def test_normalize_technique_tolerates_junk() -> None:
    for value in (None, [], "nope", 42, {}):
        result = normalize_technique(value)
        assert result.name == ""
        assert result.steps == []
        assert result.category == "Other"


def test_normalize_technique_filters_wrong_types() -> None:
    result = normalize_technique(
        {"name": "X", "steps": ["ok", 7, None], "position": 12, "description": "  "}
    )
    assert result.steps == ["ok"]
    assert result.position is None
    assert result.description is None


# --- persistence ------------------------------------------------------------


def test_create_stores_all_sections(conn: sqlite3.Connection) -> None:
    technique_id, created = create_or_enrich_technique(conn, _detail())
    assert created is True

    stored = get_technique(conn, technique_id)
    assert stored is not None
    assert stored.steps == ["grip the far collar", "trap the arm", "figure-four the wrist"]
    assert stored.key_details == ["keep the elbow tight to your body"]
    assert stored.tips == ["if they straighten the arm, switch to the armbar"]


def test_authored_technique_is_not_counted_as_trained(conn: sqlite3.Connection) -> None:
    """Adding a move to the library isn't the same as having drilled it."""
    technique_id, _ = create_or_enrich_technique(conn, _detail())
    stored = get_technique(conn, technique_id)
    assert stored is not None
    assert stored.times_trained == 0


def test_authoring_an_existing_name_never_overwrites(conn: sqlite3.Connection) -> None:
    first_id, created = create_or_enrich_technique(conn, _detail())
    assert created is True

    second_id, created_again = create_or_enrich_technique(
        conn,
        _detail(
            steps=["completely different steps"],
            key_details=["different detail"],
            tips=["different tip"],
            description="Different description.",
        ),
    )

    assert second_id == first_id
    assert created_again is False

    stored = get_technique(conn, first_id)
    assert stored is not None
    assert stored.steps == ["grip the far collar", "trap the arm", "figure-four the wrist"]
    assert stored.key_details == ["keep the elbow tight to your body"]
    assert stored.description == "A shoulder lock from half guard."


def test_authoring_fills_empty_sections_only(conn: sqlite3.Connection) -> None:
    """A technique auto-created from a session has no detail — fill it in."""
    sessions_repo.persist_session(
        conn,
        raw_transcript="t",
        structured=StructuredSession(
            techniques=[
                StructuredTechnique(name="Kimura from half guard", session_notes="")
            ]
        ),
    )

    technique_id, created = create_or_enrich_technique(conn, _detail())
    assert created is False

    stored = get_technique(conn, technique_id)
    assert stored is not None
    assert stored.steps == ["grip the far collar", "trap the arm", "figure-four the wrist"]
    # The session already counted as training; authoring must not change that.
    assert stored.times_trained == 1


def test_authored_technique_is_reused_by_a_later_session(
    conn: sqlite3.Connection,
) -> None:
    """The point of authoring up front: sessions attach to the same row."""
    technique_id, _ = create_or_enrich_technique(conn, _detail())

    sessions_repo.persist_session(
        conn,
        raw_transcript="t",
        structured=StructuredSession(
            techniques=[
                StructuredTechnique(
                    name="  kimura FROM half guard ", session_notes="drilled it today"
                )
            ]
        ),
    )

    assert conn.execute("SELECT COUNT(*) AS n FROM techniques").fetchone()["n"] == 1
    stored = get_technique(conn, technique_id)
    assert stored is not None
    assert stored.times_trained == 1
    # Curated detail survives the session mention.
    assert stored.tips == ["if they straighten the arm, switch to the armbar"]
    assert [s.session_id for s in stored.sessions] != []


# --- routes -----------------------------------------------------------------


def test_create_route(client: TestClient) -> None:
    response = client.post("/api/techniques", json={"text": WRITE_UP})
    assert response.status_code == 201

    body = response.json()
    assert body["created"] is True
    assert body["technique"]["name"] == "Kimura from half guard"
    assert len(body["technique"]["steps"]) == 3
    assert body["technique"]["times_trained"] == 0


def test_create_route_reports_existing(client: TestClient) -> None:
    client.post("/api/techniques", json={"text": WRITE_UP})
    body = client.post("/api/techniques", json={"text": WRITE_UP}).json()
    assert body["created"] is False


def test_create_route_rejects_blank(client: TestClient) -> None:
    assert client.post("/api/techniques", json={"text": "   "}).status_code == 422


def test_create_route_rejects_unidentifiable(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        groq, "structure_technique", lambda *a, **kw: StructuredTechniqueDetail(name="")
    )
    response = client.post("/api/techniques", json={"text": "asdf jkl"})
    assert response.status_code == 422
    assert "identify" in response.json()["detail"]


def test_create_route_502s_on_groq_failure(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def boom(*args, **kwargs):
        raise groq.GroqError("upstream down")

    monkeypatch.setattr(groq, "structure_technique", boom)
    assert client.post("/api/techniques", json={"text": WRITE_UP}).status_code == 502


def test_create_route_retries_once(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    attempts = {"n": 0}

    def flaky(*args, **kwargs):
        attempts["n"] += 1
        if attempts["n"] == 1:
            raise groq.GroqError("transient")
        return _detail()

    monkeypatch.setattr(groq, "structure_technique", flaky)
    assert client.post("/api/techniques", json={"text": WRITE_UP}).status_code == 201
    assert attempts["n"] == 2


def test_create_route_requires_key(client: TestClient) -> None:
    response = client.post(
        "/api/techniques", json={"text": WRITE_UP}, headers={"X-BJJ-Key": ""}
    )
    assert response.status_code == 401


def test_patch_round_trips_the_sections(client: TestClient) -> None:
    technique_id = client.post("/api/techniques", json={"text": WRITE_UP}).json()[
        "technique"
    ]["id"]

    body = client.patch(
        f"/api/techniques/{technique_id}",
        json={
            "name": "Kimura from half guard",
            "category": "Submission",
            "position": "Half guard",
            "description": "Edited.",
            "steps": ["one", "two"],
            "key_details": ["detail"],
            "tips": ["tip"],
        },
    ).json()

    assert body["steps"] == ["one", "two"]
    assert body["key_details"] == ["detail"]
    assert body["tips"] == ["tip"]
