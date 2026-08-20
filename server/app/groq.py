"""Groq API client: transcription (Whisper) + structuring (LLM, JSON mode).

OpenAI-compatible endpoints. Ported from the React Native app's `src/ai/groq.ts`,
with one improvement: the API key now lives on the server rather than shipping to
the client.

Synchronous by design. FastAPI runs `def` endpoints in a threadpool, so blocking
here never stalls the event loop, and it keeps the sqlite calls (also sync) in
the same execution context.
"""

from __future__ import annotations

import json
from typing import Any

import httpx

from .models import (
    Round,
    StructuredSequence,
    StructuredSession,
    StructuredTechnique,
    StructuredTechniqueDetail,
)
from .prompts import SYSTEM_PROMPT, TECHNIQUE_PROMPT
from .text import first_sentence, to_title

GROQ_BASE = "https://api.groq.com/openai/v1"

# Transcription of a long debrief can take a while; structuring is quicker.
TRANSCRIBE_TIMEOUT = httpx.Timeout(120.0)
STRUCTURE_TIMEOUT = httpx.Timeout(60.0)


class GroqError(RuntimeError):
    """Any failure talking to Groq, with the HTTP status when there was one."""

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


def transcribe(
    audio: bytes,
    filename: str,
    *,
    api_key: str,
    model: str,
    content_type: str = "application/octet-stream",
) -> str:
    """Transcribe an audio file with Groq Whisper. Returns the verbatim text."""
    try:
        response = httpx.post(
            f"{GROQ_BASE}/audio/transcriptions",
            headers={"Authorization": f"Bearer {api_key}"},
            files={"file": (filename, audio, content_type)},
            data={"model": model, "response_format": "text", "language": "en"},
            timeout=TRANSCRIBE_TIMEOUT,
        )
    except httpx.HTTPError as exc:
        raise GroqError(f"Network error during transcription: {exc}") from exc

    if response.status_code != 200:
        raise GroqError(
            f"Transcription failed ({response.status_code}): {response.text}",
            response.status_code,
        )
    return response.text.strip()


def _chat(
    *,
    system: str,
    user: dict[str, Any],
    api_key: str,
    model: str,
) -> Any:
    """One JSON-mode chat completion. Returns the parsed JSON object."""
    try:
        response = httpx.post(
            f"{GROQ_BASE}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": json.dumps(user)},
                ],
            },
            timeout=STRUCTURE_TIMEOUT,
        )
    except httpx.HTTPError as exc:
        raise GroqError(f"Network error during structuring: {exc}") from exc

    if response.status_code != 200:
        raise GroqError(
            f"Structuring failed ({response.status_code}): {response.text}",
            response.status_code,
        )

    try:
        content = response.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, ValueError) as exc:
        raise GroqError("Structuring returned no content.") from exc

    if not isinstance(content, str):
        raise GroqError("Structuring returned no content.")

    try:
        return json.loads(content)
    except json.JSONDecodeError as exc:
        raise GroqError("Structuring returned malformed JSON.") from exc


def structure(
    transcript: str,
    existing_technique_names: list[str],
    *,
    api_key: str,
    model: str,
) -> StructuredSession:
    """Structure a transcript into the session schema using JSON mode."""
    content = _chat(
        system=SYSTEM_PROMPT,
        user={
            "transcript": transcript,
            "existing_techniques": existing_technique_names,
        },
        api_key=api_key,
        model=model,
    )
    return normalize_structured(content)


def structure_technique(
    text: str,
    existing_technique_names: list[str],
    *,
    api_key: str,
    model: str,
) -> StructuredTechniqueDetail:
    """Structure a standalone technique write-up (not tied to a session)."""
    content = _chat(
        system=TECHNIQUE_PROMPT,
        user={"text": text, "existing_techniques": existing_technique_names},
        api_key=api_key,
        model=model,
    )
    return normalize_technique(content)


def normalize_technique(raw: Any) -> StructuredTechniqueDetail:
    """Coerce model output into a well-formed technique, tolerating omissions."""
    obj: dict[str, Any] = raw if isinstance(raw, dict) else {}

    def text_or_none(key: str) -> str | None:
        value = obj.get(key)
        return value.strip() or None if isinstance(value, str) else None

    return StructuredTechniqueDetail(
        name=obj["name"].strip() if isinstance(obj.get("name"), str) else "",
        category=obj["category"] if isinstance(obj.get("category"), str) else "Other",
        position=text_or_none("position"),
        description=text_or_none("description"),
        steps=_string_list(obj.get("steps")),
        key_details=_string_list(obj.get("key_details")),
        tips=_string_list(obj.get("tips")),
    )


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)]


def normalize_structured(raw: Any) -> StructuredSession:
    """Coerce model output into a well-formed StructuredSession.

    Tolerates omitted and wrongly-typed keys rather than failing the whole
    request — a partially-structured session still beats losing the debrief.
    """
    obj: dict[str, Any] = raw if isinstance(raw, dict) else {}

    rounds: list[Round] = []
    if isinstance(obj.get("rounds"), list):
        for item in obj["rounds"]:
            entry = item if isinstance(item, dict) else {}
            rounds.append(
                Round(
                    partner=entry["partner"] if isinstance(entry.get("partner"), str) else None,
                    outcome=entry["outcome"] if isinstance(entry.get("outcome"), str) else None,
                    notes=entry["notes"] if isinstance(entry.get("notes"), str) else "",
                )
            )

    techniques: list[StructuredTechnique] = []
    if isinstance(obj.get("techniques"), list):
        for item in obj["techniques"]:
            entry = item if isinstance(item, dict) else {}
            name = entry["name"] if isinstance(entry.get("name"), str) else ""
            if not name.strip():
                continue
            techniques.append(
                StructuredTechnique(
                    name=name,
                    category=(
                        entry["category"] if isinstance(entry.get("category"), str) else "Other"
                    ),
                    position=(
                        entry["position"] if isinstance(entry.get("position"), str) else None
                    ),
                    session_notes=(
                        entry["session_notes"]
                        if isinstance(entry.get("session_notes"), str)
                        else ""
                    ),
                )
            )

    sequences: list[StructuredSequence] = []
    if isinstance(obj.get("sequences"), list):
        for item in obj["sequences"]:
            entry = item if isinstance(item, dict) else {}
            name = entry["name"] if isinstance(entry.get("name"), str) else ""
            steps = _string_list(entry.get("steps"))
            # A sequence with no name or no steps carries no information.
            if not name.strip() or not steps:
                continue
            sequences.append(
                StructuredSequence(
                    name=name.strip(),
                    steps=steps,
                    position=(
                        entry["position"] if isinstance(entry.get("position"), str) else None
                    ),
                    technique=(
                        entry["technique"] if isinstance(entry.get("technique"), str) else None
                    ),
                    notes=entry["notes"] if isinstance(entry.get("notes"), str) else None,
                )
            )

    summary = obj["summary"] if isinstance(obj.get("summary"), str) else ""

    # The prompt asks for a short title, but models drift — clamp it here so a
    # runaway title can never reach the UI. Fall back to the summary's lead.
    raw_title = obj["title"] if isinstance(obj.get("title"), str) else ""
    source_title = raw_title if raw_title.strip() else summary

    return StructuredSession(
        title=to_title(first_sentence(source_title)) if source_title else "",
        summary=summary,
        went_well=_string_list(obj.get("went_well")),
        to_improve=_string_list(obj.get("to_improve")),
        tags=_string_list(obj.get("tags")),
        rounds=rounds,
        techniques=techniques,
        sequences=sequences,
    )
