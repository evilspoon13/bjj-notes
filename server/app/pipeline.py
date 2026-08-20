"""Audio → transcript → structured session → persisted rows.

Kept separate from the routes so the endpoints only deal with HTTP concerns.

Failure policy, carried over from the React Native app and then improved on:
structuring is retried once, and if it still fails the session is **persisted
anyway** with its raw transcript. The recording is the irreplaceable part — the
RN app surfaced the transcript in the UI but saved nothing, so a structuring
outage meant retyping. Here the debrief lands in the journal either way and can
be edited by hand.
"""

from __future__ import annotations

import logging
import sqlite3
from dataclasses import dataclass

from . import config, groq
from .models import StructuredSession, StructuredTechniqueDetail
from .repositories.sessions import persist_session
from .repositories.techniques import list_technique_names

log = logging.getLogger(__name__)

# Groq's free tier caps uploads at 25 MB. Rejecting early gives a clear error
# instead of an opaque 413 from the API.
MAX_AUDIO_BYTES = 25 * 1024 * 1024


class MissingApiKeyError(RuntimeError):
    def __init__(self) -> None:
        super().__init__("GROQ_API_KEY is not set on the server.")


class AudioTooLargeError(RuntimeError):
    def __init__(self, size: int) -> None:
        super().__init__(
            f"Recording is {size / 1_048_576:.1f} MB; the limit is "
            f"{MAX_AUDIO_BYTES // 1_048_576} MB."
        )


@dataclass
class PipelineResult:
    session_id: int
    transcript: str
    structuring_failed: bool = False
    error: str | None = None


def _require_api_key() -> str:
    if not config.GROQ_API_KEY:
        raise MissingApiKeyError()
    return config.GROQ_API_KEY


def transcribe_audio(
    audio: bytes,
    filename: str,
    content_type: str = "application/octet-stream",
) -> str:
    """Transcribe an uploaded recording. Raises on an empty result."""
    if len(audio) > MAX_AUDIO_BYTES:
        raise AudioTooLargeError(len(audio))

    transcript = groq.transcribe(
        audio,
        filename,
        api_key=_require_api_key(),
        model=config.TRANSCRIBE_MODEL,
        content_type=content_type,
    )
    if not transcript:
        raise groq.GroqError("Transcription came back empty — try recording again.")
    return transcript


def structure_transcript(
    conn: sqlite3.Connection, transcript: str
) -> tuple[StructuredSession, str | None]:
    """Structure a transcript, retrying once.

    Returns the structured session and an error message. On failure the session
    is empty and the message explains why, so the caller can still persist the
    transcript.
    """
    api_key = _require_api_key()
    # Passed to the prompt so the model reuses canonical names (the dedup path).
    existing = list_technique_names(conn)

    try:
        return groq.structure(
            transcript, existing, api_key=api_key, model=config.STRUCTURE_MODEL
        ), None
    except groq.GroqError as exc:
        # Log both attempts. The failure is swallowed into the response so the
        # transcript still gets saved, which means the log is the only place the
        # cause is ever recorded.
        log.warning("Structuring failed (attempt 1/2), retrying: %s", exc)

    try:
        return groq.structure(
            transcript, existing, api_key=api_key, model=config.STRUCTURE_MODEL
        ), None
    except groq.GroqError as exc:
        log.error("Structuring failed (attempt 2/2), saving transcript only: %s", exc)
        return StructuredSession(), str(exc)


def process_transcript(conn: sqlite3.Connection, transcript: str) -> PipelineResult:
    """Structure and persist a transcript. Never discards the transcript."""
    structured, error = structure_transcript(conn, transcript)
    session_id = persist_session(
        conn, raw_transcript=transcript, structured=structured
    )
    return PipelineResult(
        session_id=session_id,
        transcript=transcript,
        structuring_failed=error is not None,
        error=error,
    )


def structure_technique(
    conn: sqlite3.Connection, text: str
) -> StructuredTechniqueDetail:
    """Structure a standalone technique write-up, retrying once.

    Unlike a session, there is nothing worth persisting if this fails — the user
    still has their text in the box — so a failure propagates as a GroqError.
    """
    api_key = _require_api_key()
    existing = list_technique_names(conn)

    try:
        return groq.structure_technique(
            text, existing, api_key=api_key, model=config.STRUCTURE_MODEL
        )
    except groq.GroqError as exc:
        log.warning("Technique structuring failed (attempt 1/2), retrying: %s", exc)

    return groq.structure_technique(
        text, existing, api_key=api_key, model=config.STRUCTURE_MODEL
    )


def process_recording(
    conn: sqlite3.Connection,
    audio: bytes,
    filename: str,
    content_type: str = "application/octet-stream",
) -> PipelineResult:
    """Full path: transcribe an upload, then structure and persist it."""
    transcript = transcribe_audio(audio, filename, content_type)
    return process_transcript(conn, transcript)
