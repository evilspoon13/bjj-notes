"""Pydantic models for the API surface and the LLM's structured output."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

TechniqueCategory = Literal[
    "Guard", "Passing", "Submission", "Takedown", "Escape", "Sweep", "Other"
]


class Round(BaseModel):
    partner: str | None = None
    outcome: str | None = None
    notes: str = ""


class StructuredTechnique(BaseModel):
    name: str
    category: str = "Other"
    position: str | None = None
    session_notes: str = ""


class StructuredSession(BaseModel):
    """What the LLM returns for a transcript (Phase 2 fills this for real)."""

    title: str = ""
    summary: str = ""
    went_well: list[str] = Field(default_factory=list)
    to_improve: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    rounds: list[Round] = Field(default_factory=list)
    techniques: list[StructuredTechnique] = Field(default_factory=list)


class SessionTechnique(BaseModel):
    """A technique as it appears inside a single session."""

    technique_id: int
    name: str
    category: str | None = None
    position: str | None = None
    notes: str | None = None


class SessionListItem(BaseModel):
    """Journal list row. Omits the transcript to keep the payload small."""

    id: int
    created_at: str
    title: str
    summary: str | None = None
    tags: list[str] = Field(default_factory=list)


class Session(BaseModel):
    id: int
    created_at: str
    raw_transcript: str
    title: str
    summary: str | None = None
    went_well: list[str] = Field(default_factory=list)
    to_improve: list[str] = Field(default_factory=list)
    rounds: list[Round] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    techniques: list[SessionTechnique] = Field(default_factory=list)


class CreatedSession(Session):
    """A newly created session, plus whether structuring actually worked.

    Not persisted — it tells the client to offer manual editing when the LLM
    step failed but the transcript was saved regardless.
    """

    structuring_failed: bool = False
    error: str | None = None


class Technique(BaseModel):
    id: int
    name: str
    category: str | None = None
    position: str | None = None
    description: str | None = None
    times_trained: int
    first_seen: str
    last_seen: str


class TechniqueSession(BaseModel):
    """A session in which a given technique appeared."""

    session_id: int
    created_at: str
    title: str
    notes: str | None = None


class TechniqueDetail(Technique):
    sessions: list[TechniqueSession] = Field(default_factory=list)


class TechniqueUpdate(BaseModel):
    name: str = Field(min_length=1)
    category: str | None = None
    position: str | None = None
    description: str | None = None


class SessionCreate(BaseModel):
    """Text path: a transcript typed or pasted instead of recorded."""

    transcript: str = Field(min_length=1)


class SessionUpdate(BaseModel):
    """User-editable, self-assessment fields."""

    title: str | None = None
    summary: str | None = None
    went_well: list[str] = Field(default_factory=list)
    to_improve: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
