"""Title clamping and dedup normalization, ported from the RN app's helpers."""

from __future__ import annotations

import pytest

from app.text import MAX_TITLE_LENGTH, derive_title, normalize_name, to_title

LONG_SUMMARY = (
    "The session focused on the kimura trap position, specifically entries and "
    "sequences to achieve this position. Drilling included defending single leg "
    "attempts."
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("  Armbar  ", "armbar"),
        ("De   La    Riva", "de la riva"),
        ("KIMURA", "kimura"),
    ],
)
def test_normalize_name(raw: str, expected: str) -> None:
    assert normalize_name(raw) == expected


def test_to_title_leaves_short_text_alone() -> None:
    assert to_title("Kimura trap entries") == "Kimura trap entries"


def test_to_title_drops_trailing_period() -> None:
    assert to_title("Half guard passing.") == "Half guard passing"


def test_to_title_clamps_and_elides() -> None:
    result = to_title(LONG_SUMMARY)
    assert len(result) <= MAX_TITLE_LENGTH + 1  # plus the ellipsis
    assert result.endswith("…")
    assert not result[:-1].endswith(" ")


def test_derive_title_prefers_real_title() -> None:
    assert derive_title("Kimura trap entries", LONG_SUMMARY) == "Kimura trap entries"


def test_derive_title_strips_filler_lead_in() -> None:
    result = derive_title(None, LONG_SUMMARY)
    assert result.startswith("Kimura trap position")
    assert "session focused on" not in result


def test_derive_title_falls_back_to_transcript() -> None:
    assert derive_title(None, None, "Rolled six rounds today") == "Rolled six rounds today"


def test_derive_title_handles_nothing() -> None:
    assert derive_title(None, None, "") == "Untitled session"
