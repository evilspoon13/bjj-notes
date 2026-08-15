"""Small text helpers shared by the pipeline and the persistence layer.

Ported from the React Native app's `src/lib/text.ts` and `normalizeName` so the
web version produces identical titles and dedup keys.
"""

from __future__ import annotations

import re

# Hard cap for session titles, in characters. Longer text is elided.
MAX_TITLE_LENGTH = 52

_WHITESPACE = re.compile(r"\s+")
_FIRST_SENTENCE = re.compile(r"^[^.!?\n]+")

# Filler lead-ins the model used before titles existed, e.g.
# "The session focused on the kimura trap position, ...". Stripped only when
# deriving a title from a summary; the summary itself is left as written.
_SUMMARY_LEAD_IN = re.compile(
    r"^(?:the |this |today'?s )?"
    r"(?:session|class|training|practice|roll(?:ing)?)\s+"
    r"(?:focused on|centered (?:on|around)|revolved around|was (?:about|centered on)"
    r"|covered|involved|consisted of|began with)\s+"
    r"(?:the\s+)?",
    re.IGNORECASE,
)


def normalize_name(name: str) -> str:
    """Dedup key for techniques: trimmed, lowercased, whitespace-collapsed."""
    return _WHITESPACE.sub(" ", name.strip().lower())


def to_title(text: str, max_length: int = MAX_TITLE_LENGTH) -> str:
    """Clamp a string to a compact, single-line title.

    Collapses whitespace, drops a trailing period, and cuts at a word boundary
    with an ellipsis when too long.
    """
    clean = _WHITESPACE.sub(" ", text.strip()).rstrip(". ")
    if len(clean) <= max_length:
        return clean

    cut = clean[:max_length]
    last_space = cut.rfind(" ")
    # Only break on a word boundary if it doesn't chop off most of the title.
    body = cut[:last_space] if last_space > max_length * 0.6 else cut
    return f"{body.rstrip(',;: ')}…"


def first_sentence(text: str) -> str:
    """The first sentence of a block of prose (falls back to the whole string)."""
    match = _FIRST_SENTENCE.match(text)
    return (match.group(0) if match else text).strip()


def derive_title(title: str | None, summary: str | None, fallback: str = "") -> str:
    """The compact title to display for a session.

    Prefers a real title, then the first sentence of the summary with the filler
    lead-in stripped and the length clamped, then the transcript.
    """
    if title and title.strip():
        return title.strip()

    source = (summary or "").strip() or fallback.strip()
    if not source:
        return "Untitled session"

    lead = _SUMMARY_LEAD_IN.sub("", first_sentence(source))
    derived = to_title(lead)
    return derived[:1].upper() + derived[1:] if derived else "Untitled session"
