"""Model-output coercion. Everything here is offline."""

from __future__ import annotations

from app.groq import normalize_structured
from app.text import MAX_TITLE_LENGTH

GOOD = {
    "title": "Kimura trap entries",
    "summary": "Drilled kimura trap entries off the single leg.",
    "went_well": ["Grip timing"],
    "to_improve": ["Hip position"],
    "tags": ["kimura"],
    "rounds": [{"partner": "Dave", "outcome": "submitted", "notes": "caught the trap"}],
    "techniques": [
        {
            "name": "Kimura trap",
            "category": "Submission",
            "position": "Half guard",
            "session_notes": "Entries off the single leg.",
        }
    ],
}


def test_well_formed_output_passes_through() -> None:
    result = normalize_structured(GOOD)
    assert result.title == "Kimura trap entries"
    assert result.went_well == ["Grip timing"]
    assert result.rounds[0].partner == "Dave"
    assert result.techniques[0].category == "Submission"


def test_missing_keys_become_empty() -> None:
    result = normalize_structured({})
    assert result.title == ""
    assert result.summary == ""
    assert result.went_well == []
    assert result.rounds == []
    assert result.techniques == []


def test_non_dict_input_is_tolerated() -> None:
    for value in (None, [], "nope", 42):
        assert normalize_structured(value).techniques == []


def test_wrong_types_are_filtered_not_fatal() -> None:
    result = normalize_structured(
        {
            "title": 12345,
            "summary": None,
            "went_well": ["ok", 7, None, "fine"],
            "tags": "not-a-list",
            "rounds": "not-a-list",
            "techniques": [{"name": "Armbar"}, {"name": ""}, {"no_name": 1}, "junk"],
        }
    )
    assert result.went_well == ["ok", "fine"]
    assert result.tags == []
    assert result.rounds == []
    # Unnamed techniques are dropped; the named one keeps its defaults.
    assert [t.name for t in result.techniques] == ["Armbar"]
    assert result.techniques[0].category == "Other"


def test_runaway_title_is_clamped() -> None:
    result = normalize_structured(
        {
            "title": (
                "The session focused on the kimura trap position, specifically "
                "entries and sequences to achieve this position"
            ),
            "summary": "A summary.",
        }
    )
    assert len(result.title) <= MAX_TITLE_LENGTH + 1
    assert result.title.endswith("…")


def test_missing_title_falls_back_to_summary() -> None:
    result = normalize_structured({"summary": "Half guard passing drills. Then rolled."})
    # First sentence of the summary, not the whole thing.
    assert result.title == "Half guard passing drills"


def test_blank_title_falls_back_to_summary() -> None:
    assert normalize_structured({"title": "   ", "summary": "Leg locks"}).title == "Leg locks"
