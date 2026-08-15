# BJJ Notes — Web Rewrite Plan

> Moving the voice-driven BJJ journal from an Expo/React Native app to a
> mobile-first website: **React + Vite** frontend, **Python (FastAPI)** backend,
> **SQLite on a Fly.io volume**. Same pipeline as today — record a spoken debrief,
> transcribe it, structure it with an LLM, persist it as a session journal plus a
> deduplicated technique library.

The current app's design and locked decisions live in `BJJ_NOTES_APP_PLAN.md`.
This document supersedes it for the web version.

---

## 1. Locked Decisions

| Decision | Choice | Notes |
|---|---|---|
| Frontend | **React + Vite + TypeScript** | Mobile-first, desktop-usable. |
| Backend | **FastAPI** (Python 3.12) | Single service, ~5 endpoints. |
| Hosting | **Fly.io, scale-to-zero** | `auto_stop_machines = "stop"`. ~1–3s cold start. |
| Database | **SQLite on a Fly volume** | Persists across machine stop/start. Same schema as today. |
| Access control | **Single passphrase** | One shared secret, sent as a header. No user table, no login UI. |
| AI provider | **Groq** (unchanged) | `whisper-large-v3` + `llama-3.3-70b-versatile`, JSON mode. |
| Groq key | **Server-side env var** | Moves off the client entirely — an improvement over today. |
| Existing data | **Not migrated** | Starting fresh; the RN app's SQLite data is abandoned. |
| Install | **PWA** (add to home screen) | Full-screen, app-like launch from the iPhone home screen. |

### Why SQLite and not managed Postgres

A Fly volume survives machine stop/start, so scale-to-zero doesn't cost you the
database. For one user this keeps the current `db/` layer nearly intact — the SQL
translates 1:1 and there's no ORM, no connection pool, no network hop.

The tradeoff is **you own durability**. A destroyed volume is a destroyed journal.
This is why `GET /api/export` is in Phase 3 rather than "someday": backup becomes a
single authenticated request you can run from anywhere. If you later want durability
handled for you, swapping to Turso (libSQL, near-identical SQL) or Neon Postgres is a
contained change to one module.

---

## 2. Architecture

```
iPhone Safari (PWA)                    Fly.io machine (scales to zero)
┌──────────────────────┐               ┌──────────────────────────────┐
│ React + Vite         │               │ FastAPI                      │
│  MediaRecorder ──────┼── multipart ──┼─▶ /api/sessions/record       │
│  TanStack Query      │   audio       │     │                        │
│  localStorage:       │               │     ├─▶ Groq Whisper         │
│    passphrase        │◀── JSON ──────┼─    ├─▶ Groq LLM (JSON mode) │
└──────────────────────┘               │     └─▶ SQLite (Fly volume)  │
                                       └──────────────────────────────┘
```

The frontend is static and can be served by the same Fly machine (FastAPI mounts the
built `dist/`). One deploy, one origin, no CORS configuration needed.

---

## 3. Data Model

Unchanged from the current app, with `title` present from the start (no migration
needed for it this time).

```sql
CREATE TABLE sessions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at     TEXT NOT NULL,
  raw_transcript TEXT NOT NULL,
  title          TEXT,          -- compact headline
  summary        TEXT,          -- 1-2 sentence recap
  went_well      TEXT,          -- JSON array
  to_improve     TEXT,          -- JSON array
  rounds         TEXT,          -- JSON array of {partner, outcome, notes}
  tags           TEXT           -- JSON array
);

CREATE TABLE techniques (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  name_norm     TEXT NOT NULL UNIQUE,   -- dedup key
  category      TEXT,
  position      TEXT,
  description   TEXT,
  times_trained INTEGER NOT NULL DEFAULT 0,
  first_seen    TEXT NOT NULL,
  last_seen     TEXT NOT NULL
);

CREATE TABLE session_techniques (
  session_id   INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  technique_id INTEGER NOT NULL REFERENCES techniques(id) ON DELETE CASCADE,
  notes        TEXT,
  PRIMARY KEY (session_id, technique_id)
);
```

**Carry over these behaviors verbatim** — they were built and debugged already:

- **Dedup upsert** on `name_norm` (lowercased, trimmed, whitespace-collapsed), with
  existing technique names passed into the LLM prompt so it reuses canonical names.
- **Orphan pruning on session delete**: delete the session, then drop techniques left
  with zero remaining sessions and recompute `times_trained` / `first_seen` /
  `last_seen` for the survivors from the rows that remain.
- **Migrations**: keep the `user_version` pattern, but make additive column changes
  idempotent (check `PRAGMA table_info` before `ALTER`). A version counter that can
  advance without the schema change actually landing is unrecoverable — this bit us
  once already.
- `PRAGMA foreign_keys = ON` per connection; it is not persisted.

---

## 4. API

All routes require an `X-BJJ-Key` header matching the server's passphrase.

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/sessions/record` | multipart audio → transcribe → structure → persist |
| `POST` | `/api/sessions` | `{transcript}` text → structure → persist (desktop/typed fallback) |
| `GET` | `/api/sessions` | reverse-chronological list |
| `GET` | `/api/sessions/{id}` | session + its techniques |
| `PATCH` | `/api/sessions/{id}` | edit title / summary / went_well / to_improve / tags |
| `DELETE` | `/api/sessions/{id}` | delete + orphan pruning |
| `GET` | `/api/techniques` | list, with `?search=` and `?sort=recency\|frequency\|name` |
| `GET` | `/api/techniques/{id}` | technique + sessions it appeared in |
| `PATCH` | `/api/techniques/{id}` | edit name / category / position / description |
| `DELETE` | `/api/techniques/{id}` | remove from library |
| `GET` | `/api/export` | full JSON dump — your backup |

The two `POST` routes share one pipeline function; the text route just skips the
Whisper call. Keep the current failure handling: **retry structuring once, and always
return the raw transcript even when structuring fails** so a recording is never lost.

---

## 5. Frontend

**Routes** (react-router): `/` record · `/journal` · `/journal/:id` · `/library` ·
`/library/:id` · `/settings`

**Server state**: TanStack Query. `refetchOnWindowFocus` keeps phone and desktop
in sync for free.

**Styling**: Tailwind v4 with the existing palette as CSS variables — warm orange
accent (`#F97316` light / `#FB923C` dark) on cool zinc neutrals, soft filled cards
(no borders, ~18px radius, gaps between them), generous whitespace, light + dark.
Port the `Card` / `Chip` / `Section` / `Button` / `EmptyState` primitives 1:1.

**Mobile-first**: design at 390px, then add a `max-width` container plus a two-column
journal/library grid at `md:`. Bottom tab bar on mobile, top nav on desktop.

### Recording in the browser — the one real risk

`MediaRecorder` works on iOS Safari 14.5+, but with constraints:

- **Feature-detect the codec.** Safari 18.4+ can do WebM/Opus; 14.1–18.3 cannot.
  Test with `MediaRecorder.isTypeSupported()` and prefer `audio/mp4` (AAC) on iOS.
  Groq accepts `m4a`, `mp4`, `webm`, `wav`, and more, so whatever the browser
  produces can be forwarded as-is.
- **HTTPS + a user gesture** are required for `getUserMedia`. Fly gives you HTTPS;
  just make sure recording starts from a real tap handler.
- **Backgrounding the tab stops the recording.** Screen must stay on and Safari
  foregrounded. Show a clear recording indicator and elapsed timer.
- **25 MB Groq free-tier cap.** AAC at ~64kbps is roughly 50 minutes, so a normal
  debrief is nowhere near it — but reject oversized uploads with a clear message
  rather than a Groq 413.

Keep the typed-transcript path as a genuine fallback, not an afterthought. It's the
escape hatch when a browser misbehaves, and it's the better input on desktop.

---

## 6. Access Control

```python
# One secret, set as a Fly env var. Compared in constant time.
if not secrets.compare_digest(request.headers.get("X-BJJ-Key", ""), BJJ_KEY):
    raise HTTPException(401)
```

Frontend stores it in `localStorage` after you enter it once on `/settings`, and
attaches it to every request. A 401 bounces you back to the passphrase prompt.

This is not real authentication and shouldn't be described as such — it's a door
lock. What it buys: your journal isn't world-readable, and nobody else can spend your
Groq quota. Set a long random string, and serve only over HTTPS so it isn't sniffable.

---

## 7. Build Order

**Phase 1 — Backend skeleton.** FastAPI app, SQLite module with the schema above and
idempotent migrations, passphrase dependency, `GET/POST /api/sessions` against a
hardcoded fake structuring result. Deployable and testable with `curl` before any AI
or UI exists.

**Phase 2 — Pipeline.** Port `prompts.ts` → `prompts.py` verbatim (including the
title rules and the ban on filler lead-ins), the Groq transcribe + structure calls,
the response-normalizing/clamping logic, the dedup upsert, and the retry-once
behavior. Wire up `/api/sessions/record`.

**Phase 3 — Remaining endpoints.** Techniques, PATCH/DELETE with orphan pruning,
and `/api/export`. Pull an export and stash it somewhere the moment you have real
data in there.

**Phase 4 — Frontend shell.** Vite + Tailwind + router + TanStack Query, design
tokens, UI primitives, passphrase gate, journal and library list/detail screens
reading from the live API.

**Phase 5 — Recording.** `MediaRecorder` hook with codec detection, recording UI with
elapsed timer and stage feedback (transcribing → organizing → saving), typed
fallback, error states that preserve the transcript.

**Phase 6 — Deploy.** Dockerfile, `fly.toml` with a volume mount and
`auto_stop_machines`, secrets set via `fly secrets set`, FastAPI serving the built
frontend. Then PWA manifest + icons, add to home screen, use it after a session.

Phases 1–3 are independently verifiable with `curl`; don't start the frontend until
the API is solid.

---

## 8. Open Questions

- **Custom domain?** Not required — `*.fly.dev` works fine and gets HTTPS. Only
  matters if you want a memorable URL on your phone.
- **Whisper model.** `whisper-large-v3` at $0.111/hr vs `-turbo` at $0.04/hr. The
  current app chose large-v3 for BJJ/Portuguese jargon accuracy; at a few sessions a
  week the cost difference is noise, so keep it.
- ~~**Retiring the RN app.**~~ Done — the Expo project was removed from the repo.
  It remains in git history at commit `4df8d7b` if it's ever needed.
