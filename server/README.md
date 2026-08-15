# BJJ Notes — backend

FastAPI + SQLite. See `../BJJ_NOTES_WEB_PLAN.md` for the full design.

**The backend is complete** (plan phases 1–3): schema, migrations, passphrase
gate, session CRUD, the Groq pipeline (transcribe → structure → persist),
technique routes, and `/api/export`. The frontend lives in `../web`.

## Run

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

cp .env.example .env          # then edit: set BJJ_KEY and GROQ_API_KEY

.venv/bin/python -m pytest                   # tests (never hit the network)
.venv/bin/uvicorn app.main:app --reload      # http://127.0.0.1:8000
```

`.env` is gitignored and loaded automatically at startup, so secrets stay out of
your shell history and you don't re-export them every session. Exported
environment variables take precedence over the file — that's how production
works, where the values come from `fly secrets set` and no `.env` exists.

**`BJJ_KEY` is the passphrase** you type into the web app's unlock screen. There
is no default; whatever you put in `.env` is it.

The app refuses to start without `BJJ_KEY` — that's deliberate, so it can never
silently serve wide open. Interactive docs are at `/docs`.

## Try it

```bash
K="X-BJJ-Key: $BJJ_KEY"

curl -s localhost:8000/health                                    # no key needed
curl -s -H "$K" localhost:8000/api/sessions
curl -s -H "$K" -H 'Content-Type: application/json' \
  -d '{"transcript":"Worked the kimura trap today, drilled entries off a single leg."}' \
  localhost:8000/api/sessions
curl -s -H "$K" localhost:8000/api/sessions/1
curl -s -X DELETE -H "$K" -o /dev/null -w '%{http_code}\n' localhost:8000/api/sessions/1

# audio path — the one that needs a real GROQ_API_KEY
curl -s -H "$K" -F 'audio=@debrief.m4a;type=audio/mp4' \
  localhost:8000/api/sessions/record

curl -s -H "$K" 'localhost:8000/api/techniques?sort=frequency&search=kimura'
curl -s -H "$K" localhost:8000/api/export -o backup.json    # your backup
```

## Layout

- `app/config.py` — environment configuration
- `app/db.py` — connection handling and migrations
- `app/auth.py` — passphrase dependency
- `app/models.py` — Pydantic request/response models
- `app/text.py` — title clamping, dedup normalization
- `app/prompts.py` — structuring system prompt
- `app/groq.py` — Whisper + LLM calls, model-output coercion
- `app/pipeline.py` — audio → transcript → structured → persisted
- `app/export.py` — full JSON dump
- `app/repositories/` — SQL for sessions and techniques
- `tests/` — pytest; Groq is always stubbed, so no network access required

## Notes

- One SQLite connection per request; `PRAGMA foreign_keys` is set per connection
  because it is not persisted.
- Additive migrations are reconciled against `PRAGMA table_info` on every open,
  not just gated on `user_version`. A version counter can advance without the
  `ALTER` landing, and that state is otherwise unrecoverable.
- Structuring is retried once. If it still fails the session is **persisted
  anyway** with its raw transcript, and the create response sets
  `structuring_failed: true`. The recording is the irreplaceable part.
- Uploads over 25 MB are rejected before contacting Groq (free-tier limit).
