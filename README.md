# BJJ Notes

A voice-driven Brazilian Jiu-Jitsu training journal, built as a mobile-first
website. Write up a debrief after training and it becomes two things at once: a
chronological **session journal** and a growing, deduplicated **technique
library**.

Personal, single-user, self-hosted. No accounts — one shared passphrase.

## How it works

```
Browser (mobile-first, installable)      FastAPI (scales to zero)
┌────────────────────────┐               ┌────────────────────────────┐
│ React + Vite           │               │  /api/sessions/record      │
│  record or type ───────┼── transcript ─┼─▶ Groq Whisper             │
│  journal · library     │               │  ─▶ Groq LLM (JSON mode)   │
│                        │◀── JSON ──────┼─  ─▶ SQLite                │
└────────────────────────┘               └────────────────────────────┘
```

The LLM extracts a title, summary, what went well, what to improve, sparring
rounds, tags, and every technique mentioned — reusing canonical names for
techniques already in your library so the same move never appears twice.

## Getting started

```bash
# backend
cd server
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env          # set BJJ_KEY (your passphrase) + GROQ_API_KEY
.venv/bin/uvicorn app.main:app --reload

# frontend, in another terminal
cd web
npm install
npm run dev                   # http://localhost:5173
```

A Groq API key is free at <https://console.groq.com/keys>.

Details: [`server/README.md`](server/README.md) ·
[`web/README.md`](web/README.md) · design and build order in
[`BJJ_NOTES_WEB_PLAN.md`](BJJ_NOTES_WEB_PLAN.md).

## Backups

Your journal lives in one SQLite file. `GET /api/export` (or the button in
Settings) returns everything as JSON — transcripts included. Use it.

## History

This began as an Expo/React Native iOS app running in Expo Go. The web rewrite
replaced it; the mobile version is in git history at commit `4df8d7b`.
