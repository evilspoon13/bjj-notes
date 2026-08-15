"""Runtime configuration.

Values come from the environment. For local development a gitignored
`server/.env` is loaded first, so you don't re-export secrets in every shell and
they stay out of your shell history. Real environment variables always win over
`.env`, which is what makes production work: on Fly these come from
`fly secrets set` and no `.env` file exists.

Read once at import, so the environment must be set before the app starts.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

SERVER_DIR = Path(__file__).resolve().parent.parent

# override=False: an explicitly exported variable beats the file.
load_dotenv(SERVER_DIR / ".env", override=False)

# Passphrase guarding every API route. Empty means "unset", which the app treats
# as a hard error rather than silently running wide open.
BJJ_KEY: str = os.environ.get("BJJ_KEY", "")

# SQLite file. On Fly this points at the mounted volume so it survives the
# machine stopping and starting again.
DATABASE_PATH: Path = Path(os.environ.get("DATABASE_PATH", "bjj-notes.db"))

# Groq: https://console.groq.com/keys
GROQ_API_KEY: str = os.environ.get("GROQ_API_KEY", "")
TRANSCRIBE_MODEL: str = os.environ.get("TRANSCRIBE_MODEL", "whisper-large-v3")
STRUCTURE_MODEL: str = os.environ.get("STRUCTURE_MODEL", "llama-3.3-70b-versatile")
