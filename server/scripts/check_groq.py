"""Diagnose the structuring step against the live Groq API.

The pipeline deliberately swallows a structuring failure so the transcript is
never lost, which makes the cause hard to see from the app. This runs the same
call on its own and prints whatever comes back.

    cd server && .venv/bin/python -m scripts.check_groq
    cd server && .venv/bin/python -m scripts.check_groq "my own debrief text"

Reads GROQ_API_KEY / STRUCTURE_MODEL from the environment or `server/.env`,
exactly like the app does.
"""

from __future__ import annotations

import json
import sys

import httpx

from app import config
from app.groq import GROQ_BASE, STRUCTURE_TIMEOUT
from app.prompts import SYSTEM_PROMPT

SAMPLE = (
    "Worked the kimura trap today. From half guard I got the far collar and near "
    "sleeve, turned my hands like a wheel, and came up to the trap. Rolled with "
    "Dave and got swept twice — need to fix my base."
)


def main() -> int:
    transcript = sys.argv[1] if len(sys.argv) > 1 else SAMPLE

    if not config.GROQ_API_KEY:
        print("GROQ_API_KEY is not set (checked the environment and server/.env).")
        return 1

    print(f"model: {config.STRUCTURE_MODEL}")
    print(f"key:   ...{config.GROQ_API_KEY[-4:]} ({len(config.GROQ_API_KEY)} chars)")

    response = httpx.post(
        f"{GROQ_BASE}/chat/completions",
        headers={"Authorization": f"Bearer {config.GROQ_API_KEY}"},
        json={
            "model": config.STRUCTURE_MODEL,
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(
                        {"transcript": transcript, "existing_techniques": []}
                    ),
                },
            ],
        },
        timeout=STRUCTURE_TIMEOUT,
    )

    print(f"status: {response.status_code}")
    if response.status_code != 200:
        print(response.text)
        # Groq retires models on a rolling schedule, so a dead STRUCTURE_MODEL
        # is the likeliest failure here. Show what the key can actually reach.
        _print_available_models()
        return 1

    print(response.json()["choices"][0]["message"]["content"])
    return 0


def _print_available_models() -> None:
    response = httpx.get(
        f"{GROQ_BASE}/models",
        headers={"Authorization": f"Bearer {config.GROQ_API_KEY}"},
        timeout=STRUCTURE_TIMEOUT,
    )
    if response.status_code != 200:
        print(f"\ncould not list models ({response.status_code}): {response.text}")
        return

    print("\navailable models:")
    for model in sorted(response.json().get("data", []), key=lambda m: m["id"]):
        # Whisper models can't chat; keep the list to structuring candidates.
        if "whisper" in model["id"] or "tts" in model["id"]:
            continue
        window = model.get("context_window", "?")
        print(f"  {model['id']:<48} context {window}")


if __name__ == "__main__":
    raise SystemExit(main())
