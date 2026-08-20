"""Sequences: extraction, technique linking, and the routes.

Sequences are per-session and lossless — that property is what these tests
mostly guard, since it's the opposite of how techniques behave.
"""

from __future__ import annotations

import sqlite3

import pytest
from fastapi.testclient import TestClient

from app.groq import normalize_structured
from app.models import StructuredSequence, StructuredSession, StructuredTechnique
from app.repositories import sequences as sequences_repo
from app.repositories import sessions as sessions_repo

KIMURA_STEPS = [
    "grip the far collar and the near sleeve",
    "turn the hands like a wheel",
    "circle to the outside",
]


def _session(
    *,
    techniques: list[StructuredTechnique] | None = None,
    sequences: list[StructuredSequence] | None = None,
    title: str = "Session",
) -> StructuredSession:
    return StructuredSession(
        title=title,
        summary="A session.",
        techniques=techniques or [],
        sequences=sequences or [],
    )


def _kimura_sequence(**overrides) -> StructuredSequence:
    defaults = {
        "name": "Wheel motion entry to kimura trap",
        "steps": KIMURA_STEPS,
        "position": "Half guard",
        "technique": "Kimura trap",
        "notes": "Keep the elbow tight or they slip out.",
    }
    return StructuredSequence(**{**defaults, **overrides})


# --- extraction -------------------------------------------------------------


def test_model_output_is_parsed() -> None:
    result = normalize_structured(
        {
            "summary": "s",
            "sequences": [
                {
                    "name": "Wheel motion entry to kimura trap",
                    "steps": KIMURA_STEPS,
                    "position": "Half guard",
                    "technique": "Kimura trap",
                    "notes": "n",
                }
            ],
        }
    )
    assert len(result.sequences) == 1
    assert result.sequences[0].steps == KIMURA_STEPS


def test_sequences_without_name_or_steps_are_dropped() -> None:
    """Either alone carries no information worth storing."""
    result = normalize_structured(
        {
            "sequences": [
                {"name": "", "steps": KIMURA_STEPS},
                {"name": "No steps given", "steps": []},
                {"name": "Fine", "steps": ["a step"]},
                "junk",
            ]
        }
    )
    assert [s.name for s in result.sequences] == ["Fine"]


def test_wrong_types_are_filtered() -> None:
    result = normalize_structured(
        {"sequences": [{"name": "X", "steps": ["ok", 7, None], "position": 12}]}
    )
    assert result.sequences[0].steps == ["ok"]
    assert result.sequences[0].position is None


def test_missing_sequences_key_is_fine() -> None:
    assert normalize_structured({"summary": "s"}).sequences == []


# --- persistence ------------------------------------------------------------


def test_sequence_links_to_technique_from_same_session(
    conn: sqlite3.Connection,
) -> None:
    session_id = sessions_repo.persist_session(
        conn,
        raw_transcript="t",
        structured=_session(
            techniques=[StructuredTechnique(name="Kimura trap", session_notes="x")],
            sequences=[_kimura_sequence()],
        ),
    )

    stored = sequences_repo.list_for_session(conn, session_id)
    assert len(stored) == 1
    assert stored[0].technique_name == "Kimura trap"
    assert stored[0].technique_id is not None
    assert stored[0].steps == KIMURA_STEPS


def test_technique_link_matches_case_insensitively(conn: sqlite3.Connection) -> None:
    session_id = sessions_repo.persist_session(
        conn,
        raw_transcript="t",
        structured=_session(
            techniques=[StructuredTechnique(name="Kimura trap", session_notes="x")],
            sequences=[_kimura_sequence(technique="  KIMURA   TRAP ")],
        ),
    )
    assert sequences_repo.list_for_session(conn, session_id)[0].technique_name == "Kimura trap"


def test_link_resolves_against_the_wider_library(conn: sqlite3.Connection) -> None:
    """A sequence can point at a technique learned in an earlier session."""
    sessions_repo.persist_session(
        conn,
        raw_transcript="first",
        structured=_session(
            techniques=[StructuredTechnique(name="Kimura trap", session_notes="x")]
        ),
    )
    session_id = sessions_repo.persist_session(
        conn,
        raw_transcript="second",
        structured=_session(sequences=[_kimura_sequence()]),
    )

    assert sequences_repo.list_for_session(conn, session_id)[0].technique_name == "Kimura trap"


def test_unmatched_technique_leaves_sequence_unlinked(conn: sqlite3.Connection) -> None:
    """A wrong link would be worse than no link."""
    session_id = sessions_repo.persist_session(
        conn,
        raw_transcript="t",
        structured=_session(sequences=[_kimura_sequence(technique="Something unknown")]),
    )
    stored = sequences_repo.list_for_session(conn, session_id)[0]
    assert stored.technique_id is None
    assert stored.technique_name is None


def test_same_sequence_twice_keeps_both(conn: sqlite3.Connection) -> None:
    """The lossless property: unlike techniques, sequences never merge."""
    sessions_repo.persist_session(
        conn,
        raw_transcript="first",
        structured=_session(sequences=[_kimura_sequence(steps=["grip", "turn"])]),
        created_at="2026-01-01T00:00:00+00:00",
    )
    sessions_repo.persist_session(
        conn,
        raw_transcript="second",
        structured=_session(
            sequences=[_kimura_sequence(steps=["grip", "turn", "circle", "sit back"])]
        ),
        created_at="2026-02-01T00:00:00+00:00",
    )

    stored = sequences_repo.list_sequences(conn)
    assert len(stored) == 2
    # Newest first, and the richer second description is not discarded.
    assert len(stored[0].steps) == 4
    assert len(stored[1].steps) == 2


def test_deleting_a_session_deletes_its_sequences(conn: sqlite3.Connection) -> None:
    session_id = sessions_repo.persist_session(
        conn,
        raw_transcript="t",
        structured=_session(sequences=[_kimura_sequence()]),
    )
    sessions_repo.delete_session(conn, session_id)
    assert sequences_repo.list_sequences(conn) == []


def test_deleting_a_technique_keeps_the_sequence(conn: sqlite3.Connection) -> None:
    """ON DELETE SET NULL: the steps are still worth keeping."""
    sessions_repo.persist_session(
        conn,
        raw_transcript="t",
        structured=_session(
            techniques=[StructuredTechnique(name="Kimura trap", session_notes="x")],
            sequences=[_kimura_sequence()],
        ),
    )
    technique_id = conn.execute("SELECT id FROM techniques").fetchone()["id"]

    conn.execute("DELETE FROM techniques WHERE id = ?", (technique_id,))

    remaining = sequences_repo.list_sequences(conn)
    assert len(remaining) == 1
    assert remaining[0].technique_id is None
    assert remaining[0].steps == KIMURA_STEPS


# --- routes -----------------------------------------------------------------


@pytest.fixture
def seeded(conn: sqlite3.Connection) -> sqlite3.Connection:
    sessions_repo.persist_session(
        conn,
        raw_transcript="t",
        structured=_session(
            title="Kimura day",
            techniques=[StructuredTechnique(name="Kimura trap", session_notes="x")],
            sequences=[
                _kimura_sequence(),
                StructuredSequence(
                    name="Single leg defense to back take",
                    steps=["underhook the far arm", "sprawl", "spin behind"],
                    technique=None,
                ),
            ],
        ),
    )
    conn.commit()
    return conn


def test_list_route(client: TestClient, seeded: sqlite3.Connection) -> None:
    body = client.get("/api/sequences").json()
    assert len(body) == 2
    assert body[0]["session_title"] == "Kimura day"
    assert body[0]["created_at"]


def test_search_covers_steps_and_technique(
    client: TestClient, seeded: sqlite3.Connection
) -> None:
    by_step = client.get("/api/sequences?search=wheel").json()
    assert [s["name"] for s in by_step] == ["Wheel motion entry to kimura trap"]

    by_technique = client.get("/api/sequences?search=kimura").json()
    assert len(by_technique) == 1

    assert client.get("/api/sequences?search=berimbolo").json() == []


def test_session_detail_includes_sequences(
    client: TestClient, seeded: sqlite3.Connection
) -> None:
    session_id = client.get("/api/sessions").json()[0]["id"]
    body = client.get(f"/api/sessions/{session_id}").json()
    assert len(body["sequences"]) == 2
    assert body["sequences"][0]["steps"] == KIMURA_STEPS


def test_technique_detail_shows_ways_in(
    client: TestClient, seeded: sqlite3.Connection
) -> None:
    technique_id = client.get("/api/techniques").json()[0]["id"]
    body = client.get(f"/api/techniques/{technique_id}").json()
    assert [s["name"] for s in body["sequences"]] == [
        "Wheel motion entry to kimura trap"
    ]


def test_delete_route(client: TestClient, seeded: sqlite3.Connection) -> None:
    sequence_id = client.get("/api/sequences").json()[0]["id"]
    assert client.delete(f"/api/sequences/{sequence_id}").status_code == 204
    assert len(client.get("/api/sequences").json()) == 1
    assert client.delete(f"/api/sequences/{sequence_id}").status_code == 404


def test_export_includes_sequences(client: TestClient, seeded: sqlite3.Connection) -> None:
    body = client.get("/api/export").json()
    assert body["counts"]["sequences"] == 2
    assert len(body["sequences"]) == 2


def test_sequences_require_key(client: TestClient) -> None:
    assert client.get("/api/sequences", headers={"X-BJJ-Key": ""}).status_code == 401
