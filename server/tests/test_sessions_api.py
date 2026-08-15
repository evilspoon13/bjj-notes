"""Session routes and the passphrase gate."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import config, groq
from app.models import StructuredSession, StructuredTechnique

TRANSCRIPT = (
    "Worked the kimura trap today. Drilled entries off a single leg and "
    "transitioned into the back take. Rolled four rounds."
)


@pytest.fixture(autouse=True)
def stub_groq(monkeypatch: pytest.MonkeyPatch) -> None:
    """These tests exercise the HTTP/persistence layer, not the LLM."""
    monkeypatch.setattr(config, "GROQ_API_KEY", "test-key")
    monkeypatch.setattr(
        groq,
        "structure",
        lambda *args, **kwargs: StructuredSession(
            title="Kimura trap entries",
            summary="Drilled kimura trap entries off the single leg.",
            tags=["kimura"],
            techniques=[
                StructuredTechnique(name="Kimura trap", session_notes="Off the single leg.")
            ],
        ),
    )


def test_health_needs_no_key(client: TestClient) -> None:
    response = client.get("/health", headers={"X-BJJ-Key": ""})
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_api_rejects_missing_key(client: TestClient) -> None:
    response = client.get("/api/sessions", headers={"X-BJJ-Key": ""})
    assert response.status_code == 401


def test_api_rejects_wrong_key(client: TestClient) -> None:
    response = client.get("/api/sessions", headers={"X-BJJ-Key": "nope"})
    assert response.status_code == 401


def test_empty_journal(client: TestClient) -> None:
    assert client.get("/api/sessions").json() == []


def test_create_and_read_session(client: TestClient) -> None:
    created = client.post("/api/sessions", json={"transcript": TRANSCRIPT})
    assert created.status_code == 201
    body = created.json()

    assert body["raw_transcript"] == TRANSCRIPT
    assert body["title"]
    assert len(body["title"]) <= 52
    assert [t["name"] for t in body["techniques"]] == ["Kimura trap"]

    assert body["structuring_failed"] is False

    fetched = client.get(f"/api/sessions/{body['id']}")
    assert fetched.status_code == 200
    # GET returns the stored session; POST adds the transient pipeline status.
    assert fetched.json() == {
        k: v for k, v in body.items() if k not in {"structuring_failed", "error"}
    }

    listed = client.get("/api/sessions").json()
    assert len(listed) == 1
    assert listed[0]["id"] == body["id"]
    assert "raw_transcript" not in listed[0]


def test_create_rejects_blank_transcript(client: TestClient) -> None:
    assert client.post("/api/sessions", json={"transcript": "   "}).status_code == 422
    assert client.post("/api/sessions", json={"transcript": ""}).status_code == 422


def test_update_session(client: TestClient) -> None:
    session_id = client.post("/api/sessions", json={"transcript": TRANSCRIPT}).json()["id"]

    response = client.patch(
        f"/api/sessions/{session_id}",
        json={
            "title": "Kimura trap entries",
            "summary": "Drilled kimura trap entries off the single leg.",
            "went_well": ["Grip timing"],
            "to_improve": ["Hip position"],
            "tags": ["kimura", "back take"],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Kimura trap entries"
    assert body["went_well"] == ["Grip timing"]
    assert body["tags"] == ["kimura", "back take"]


def test_update_clamps_long_title(client: TestClient) -> None:
    session_id = client.post("/api/sessions", json={"transcript": TRANSCRIPT}).json()["id"]

    long_title = (
        "The session focused on the kimura trap position, specifically entries "
        "and sequences to achieve this position"
    )
    body = client.patch(
        f"/api/sessions/{session_id}",
        json={"title": long_title, "summary": None, "went_well": [], "to_improve": [], "tags": []},
    ).json()

    assert len(body["title"]) <= 53  # 52 chars plus the ellipsis
    assert body["title"].endswith("…")


def test_missing_session_is_404(client: TestClient) -> None:
    assert client.get("/api/sessions/999").status_code == 404
    assert client.delete("/api/sessions/999").status_code == 404
    assert (
        client.patch(
            "/api/sessions/999",
            json={"title": None, "summary": None, "went_well": [], "to_improve": [], "tags": []},
        ).status_code
        == 404
    )


def test_delete_session(client: TestClient) -> None:
    session_id = client.post("/api/sessions", json={"transcript": TRANSCRIPT}).json()["id"]

    assert client.delete(f"/api/sessions/{session_id}").status_code == 204
    assert client.get(f"/api/sessions/{session_id}").status_code == 404
    assert client.get("/api/sessions").json() == []
