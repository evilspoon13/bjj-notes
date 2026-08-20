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


class StructuredSequence(BaseModel):
    """An ordered chain of grips and movements described in the debrief.

    `technique` is the name of the technique or position the chain arrives at;
    it is resolved to a real technique id at persist time when it matches one.
    """

    name: str
    steps: list[str] = Field(default_factory=list)
    position: str | None = None
    technique: str | None = None
    notes: str | None = None


class StructuredSession(BaseModel):
    """What the LLM returns for a transcript."""

    title: str = ""
    summary: str = ""
    went_well: list[str] = Field(default_factory=list)
    to_improve: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    rounds: list[Round] = Field(default_factory=list)
    techniques: list[StructuredTechnique] = Field(default_factory=list)
    sequences: list[StructuredSequence] = Field(default_factory=list)


class SessionTechnique(BaseModel):
    """A technique as it appears inside a single session."""

    technique_id: int
    name: str
    category: str | None = None
    position: str | None = None
    notes: str | None = None


class Sequence(BaseModel):
    """A stored sequence, with enough session context to stand alone in a list."""

    id: int
    session_id: int
    session_title: str
    created_at: str
    name: str
    steps: list[str] = Field(default_factory=list)
    position: str | None = None
    technique_id: int | None = None
    technique_name: str | None = None
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
    sequences: list[Sequence] = Field(default_factory=list)


class CreatedSession(Session):
    """A newly created session, plus whether structuring actually worked.

    Not persisted — it tells the client to offer manual editing when the LLM
    step failed but the transcript was saved regardless.
    """

    structuring_failed: bool = False
    error: str | None = None


class Technique(BaseModel):
    """A move in the library.

    `steps` / `key_details` / `tips` describe how to execute the move itself.
    How it chains with other moves belongs in `sequences`, not here.
    """

    id: int
    name: str
    category: str | None = None
    position: str | None = None
    description: str | None = None
    steps: list[str] = Field(default_factory=list)
    key_details: list[str] = Field(default_factory=list)
    tips: list[str] = Field(default_factory=list)
    times_trained: int
    first_seen: str
    last_seen: str


class StructuredTechniqueDetail(BaseModel):
    """What the LLM returns when structuring a standalone technique write-up."""

    name: str = ""
    category: str = "Other"
    position: str | None = None
    description: str | None = None
    steps: list[str] = Field(default_factory=list)
    key_details: list[str] = Field(default_factory=list)
    tips: list[str] = Field(default_factory=list)


class TechniqueCreate(BaseModel):
    """Free text describing a move; the LLM structures it."""

    text: str = Field(min_length=1)


class TechniqueSession(BaseModel):
    """A session in which a given technique appeared."""

    session_id: int
    created_at: str
    title: str
    notes: str | None = None


class TechniqueDetail(Technique):
    sessions: list[TechniqueSession] = Field(default_factory=list)

    # Sequences that arrive at this technique — "the ways I've gotten here".
    sequences: list[Sequence] = Field(default_factory=list)


class CreatedTechnique(BaseModel):
    """Result of adding a technique by hand.

    `created` is False when the name already existed — in that case only empty
    fields were filled in, so nothing you had written was overwritten.
    """

    technique: TechniqueDetail
    created: bool


class TechniqueUpdate(BaseModel):
    name: str = Field(min_length=1)
    category: str | None = None
    position: str | None = None
    description: str | None = None
    steps: list[str] = Field(default_factory=list)
    key_details: list[str] = Field(default_factory=list)
    tips: list[str] = Field(default_factory=list)


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
