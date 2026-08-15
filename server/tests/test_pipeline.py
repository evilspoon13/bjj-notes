"""Pipeline orchestration: retry, failure preservation, and the audio route.

Groq is always stubbed — the suite never touches the network.
"""

from __future__ import annotations

import sqlite3

import pytest
from fastapi.testclient import TestClient

from app import config, groq, pipeline
from app.models import StructuredSession, StructuredTechnique

TRANSCRIPT = "Drilled the kimura trap off a single leg, then rolled four rounds."


def _structured() -> StructuredSession:
    return StructuredSession(
        title="Kimura trap entries",
        summary="Drilled kimura trap entries.",
        tags=["kimura"],
        techniques=[StructuredTechnique(name="Kimura trap", session_notes="Off the single leg.")],
    )


@pytest.fixture(autouse=True)
def api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "GROQ_API_KEY", "test-key")


def test_structure_succeeds_first_try(
    conn: sqlite3.Connection, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = []

    def fake_structure(transcript, existing, **kwargs):
        calls.append(existing)
        return _structured()

    monkeypatch.setattr(groq, "structure", fake_structure)

    result = pipeline.process_transcript(conn, TRANSCRIPT)

    assert len(calls) == 1
    assert result.structuring_failed is False
    assert result.error is None


def test_existing_technique_names_are_passed_to_the_prompt(
    conn: sqlite3.Connection, monkeypatch: pytest.MonkeyPatch
) -> None:
    """This is the dedup strategy — the model must see what already exists."""
    seen: list[list[str]] = []

    monkeypatch.setattr(
        groq, "structure", lambda t, existing, **kw: (seen.append(existing), _structured())[1]
    )

    pipeline.process_transcript(conn, TRANSCRIPT)
    pipeline.process_transcript(conn, "Another session.")

    assert seen[0] == []
    assert seen[1] == ["Kimura trap"]


def test_structuring_retries_once(
    conn: sqlite3.Connection, monkeypatch: pytest.MonkeyPatch
) -> None:
    attempts = {"n": 0}

    def flaky(transcript, existing, **kwargs):
        attempts["n"] += 1
        if attempts["n"] == 1:
            raise groq.GroqError("transient")
        return _structured()

    monkeypatch.setattr(groq, "structure", flaky)

    result = pipeline.process_transcript(conn, TRANSCRIPT)

    assert attempts["n"] == 2
    assert result.structuring_failed is False


def test_transcript_is_persisted_when_structuring_fails(
    conn: sqlite3.Connection, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The recording is the irreplaceable part — it must survive an LLM outage."""
    attempts = {"n": 0}

    def always_fails(transcript, existing, **kwargs):
        attempts["n"] += 1
        raise groq.GroqError("Structuring failed (503): upstream down")

    monkeypatch.setattr(groq, "structure", always_fails)

    result = pipeline.process_transcript(conn, TRANSCRIPT)

    assert attempts["n"] == 2  # tried, then retried
    assert result.structuring_failed is True
    assert "503" in (result.error or "")

    row = conn.execute(
        "SELECT raw_transcript, summary FROM sessions WHERE id = ?", (result.session_id,)
    ).fetchone()
    assert row["raw_transcript"] == TRANSCRIPT
    assert row["summary"] is None


def test_missing_api_key_is_reported(conn: sqlite3.Connection, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "GROQ_API_KEY", "")
    with pytest.raises(pipeline.MissingApiKeyError):
        pipeline.process_transcript(conn, TRANSCRIPT)


def test_oversized_audio_is_rejected_before_upload(monkeypatch: pytest.MonkeyPatch) -> None:
    def should_not_run(*args, **kwargs):
        raise AssertionError("must not call Groq with an oversized file")

    monkeypatch.setattr(groq, "transcribe", should_not_run)

    with pytest.raises(pipeline.AudioTooLargeError):
        pipeline.transcribe_audio(b"x" * (pipeline.MAX_AUDIO_BYTES + 1), "big.m4a")


def test_empty_transcription_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(groq, "transcribe", lambda *a, **kw: "   ".strip())
    with pytest.raises(groq.GroqError, match="empty"):
        pipeline.transcribe_audio(b"audio", "session.m4a")


# --- HTTP layer ------------------------------------------------------------


def test_record_route_end_to_end(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(groq, "transcribe", lambda *a, **kw: TRANSCRIPT)
    monkeypatch.setattr(groq, "structure", lambda *a, **kw: _structured())

    response = client.post(
        "/api/sessions/record",
        files={"audio": ("session.m4a", b"fake-audio-bytes", "audio/mp4")},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["raw_transcript"] == TRANSCRIPT
    assert body["title"] == "Kimura trap entries"
    assert body["structuring_failed"] is False
    assert [t["name"] for t in body["techniques"]] == ["Kimura trap"]


def test_record_route_flags_structuring_failure(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(groq, "transcribe", lambda *a, **kw: TRANSCRIPT)

    def boom(*args, **kwargs):
        raise groq.GroqError("upstream down")

    monkeypatch.setattr(groq, "structure", boom)

    body = client.post(
        "/api/sessions/record",
        files={"audio": ("session.m4a", b"fake-audio-bytes", "audio/mp4")},
    ).json()

    assert body["structuring_failed"] is True
    assert body["raw_transcript"] == TRANSCRIPT
    # Still readable in the journal, with a title derived from the transcript.
    assert body["title"]


def test_record_route_502s_when_transcription_fails(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def boom(*args, **kwargs):
        raise groq.GroqError("Transcription failed (500): nope", 500)

    monkeypatch.setattr(groq, "transcribe", boom)

    response = client.post(
        "/api/sessions/record",
        files={"audio": ("session.m4a", b"fake-audio-bytes", "audio/mp4")},
    )
    assert response.status_code == 502


def test_record_route_rejects_empty_upload(client: TestClient) -> None:
    response = client.post(
        "/api/sessions/record", files={"audio": ("session.m4a", b"", "audio/mp4")}
    )
    assert response.status_code == 422


def test_record_route_requires_key(client: TestClient) -> None:
    response = client.post(
        "/api/sessions/record",
        files={"audio": ("session.m4a", b"audio", "audio/mp4")},
        headers={"X-BJJ-Key": ""},
    )
    assert response.status_code == 401


def test_missing_api_key_returns_503(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "GROQ_API_KEY", "")
    response = client.post("/api/sessions", json={"transcript": TRANSCRIPT})
    assert response.status_code == 503
