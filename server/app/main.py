"""FastAPI application.

Health check (unauthenticated, for the platform's probe) plus the API: session
CRUD, the audio and text recording paths, the technique library, and the JSON
export. Everything under `/api` sits behind the passphrase gate.
"""

from __future__ import annotations

import sqlite3
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse

from . import config, db, export, groq, pipeline
from .auth import MissingKeyError, require_key
from .models import (
    CreatedSession,
    Session,
    SessionCreate,
    SessionListItem,
    SessionUpdate,
    Technique,
    TechniqueDetail,
    TechniqueUpdate,
)
from .repositories import sessions as sessions_repo
from .repositories import techniques as techniques_repo
from .repositories.techniques import DuplicateTechniqueError, TechniqueSort


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    if not config.BJJ_KEY:
        raise MissingKeyError()
    with db.session_scope() as conn:
        db.migrate(conn)
    yield


app = FastAPI(title="BJJ Notes", lifespan=lifespan)

# Every route below the passphrase gate.
api = APIRouter(prefix="/api", dependencies=[Depends(require_key)])


@app.get("/health")
def health() -> dict[str, str]:
    """Unauthenticated liveness probe — used by Fly to wake/monitor the machine."""
    return {"status": "ok"}


@api.get("/sessions", response_model=list[SessionListItem])
def list_sessions(conn: sqlite3.Connection = Depends(db.get_db)) -> list[SessionListItem]:
    return sessions_repo.list_sessions(conn)


def _finish(
    conn: sqlite3.Connection, result: pipeline.PipelineResult
) -> CreatedSession:
    """Commit a pipeline run and build its response.

    Commits before responding: the request-scoped connection would commit on
    teardown anyway, but that can run after the response is flushed — a client
    that refetches immediately could otherwise miss its own write.
    """
    conn.commit()

    created = sessions_repo.get_session(conn, result.session_id)
    assert created is not None  # just inserted in this transaction
    return CreatedSession(
        **created.model_dump(),
        structuring_failed=result.structuring_failed,
        error=result.error,
    )


@api.post("/sessions", response_model=CreatedSession, status_code=status.HTTP_201_CREATED)
def create_session(
    body: SessionCreate,
    conn: sqlite3.Connection = Depends(db.get_db),
) -> CreatedSession:
    """Text path: structure and persist an already-transcribed debrief."""
    transcript = body.transcript.strip()
    if not transcript:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Transcript is empty.")

    try:
        result = pipeline.process_transcript(conn, transcript)
    except pipeline.MissingApiKeyError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc

    return _finish(conn, result)


@api.post(
    "/sessions/record",
    response_model=CreatedSession,
    status_code=status.HTTP_201_CREATED,
)
def record_session(
    audio: UploadFile = File(...),
    conn: sqlite3.Connection = Depends(db.get_db),
) -> CreatedSession:
    """Audio path: transcribe an upload, then structure and persist it."""
    payload = audio.file.read()
    if not payload:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Recording is empty.")

    try:
        result = pipeline.process_recording(
            conn,
            payload,
            audio.filename or "session.m4a",
            audio.content_type or "application/octet-stream",
        )
    except pipeline.MissingApiKeyError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except pipeline.AudioTooLargeError as exc:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, str(exc)) from exc
    except groq.GroqError as exc:
        # Transcription failed, so there is no transcript to preserve.
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc

    return _finish(conn, result)


@api.get("/sessions/{session_id}", response_model=Session)
def get_session(
    session_id: int,
    conn: sqlite3.Connection = Depends(db.get_db),
) -> Session:
    session = sessions_repo.get_session(conn, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found.")
    return session


@api.patch("/sessions/{session_id}", response_model=Session)
def update_session(
    session_id: int,
    body: SessionUpdate,
    conn: sqlite3.Connection = Depends(db.get_db),
) -> Session:
    if not sessions_repo.update_session(conn, session_id, body):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found.")
    conn.commit()

    updated = sessions_repo.get_session(conn, session_id)
    assert updated is not None
    return updated


@api.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: int,
    conn: sqlite3.Connection = Depends(db.get_db),
) -> None:
    if not sessions_repo.delete_session(conn, session_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found.")
    conn.commit()


@api.get("/techniques", response_model=list[Technique])
def list_techniques(
    search: str | None = None,
    sort: TechniqueSort = "recency",
    conn: sqlite3.Connection = Depends(db.get_db),
) -> list[Technique]:
    return techniques_repo.list_techniques(conn, search=search, sort=sort)


@api.get("/techniques/{technique_id}", response_model=TechniqueDetail)
def get_technique(
    technique_id: int,
    conn: sqlite3.Connection = Depends(db.get_db),
) -> TechniqueDetail:
    technique = techniques_repo.get_technique(conn, technique_id)
    if technique is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Technique not found.")
    return technique


@api.patch("/techniques/{technique_id}", response_model=TechniqueDetail)
def update_technique(
    technique_id: int,
    body: TechniqueUpdate,
    conn: sqlite3.Connection = Depends(db.get_db),
) -> TechniqueDetail:
    try:
        found = techniques_repo.update_technique(conn, technique_id, body)
    except DuplicateTechniqueError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc

    if not found:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Technique not found.")
    conn.commit()

    updated = techniques_repo.get_technique(conn, technique_id)
    assert updated is not None
    return updated


@api.delete("/techniques/{technique_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_technique(
    technique_id: int,
    conn: sqlite3.Connection = Depends(db.get_db),
) -> None:
    if not techniques_repo.delete_technique(conn, technique_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Technique not found.")
    conn.commit()


@api.get("/export")
def export_all(conn: sqlite3.Connection = Depends(db.get_db)) -> JSONResponse:
    """Full JSON dump — the backup for a self-managed volume."""
    payload = export.build_export(conn)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return JSONResponse(
        payload,
        headers={
            "Content-Disposition": f'attachment; filename="bjj-notes-{stamp}.json"'
        },
    )


app.include_router(api)
