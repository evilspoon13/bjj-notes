# BJJ Notes

Voice-driven Brazilian Jiu-Jitsu training journal, as a mobile-first website.
After training you write up (or record) a spoken debrief; the backend transcribes
it (Groq Whisper), structures it (Groq LLM, JSON mode), and stores it as both a
session journal and a deduplicated technique library.

Personal single-user app. No accounts — a single shared passphrase gates the API.

See `BJJ_NOTES_WEB_PLAN.md` for the full design, locked decisions, and the phased
build order.

> This started as an Expo/React Native iOS app. That version was removed once the
> web rewrite took over; it lives in git history at commit `4df8d7b`.

## Layout

- `server/` — FastAPI + SQLite backend. See `server/README.md`.
- `web/` — React + Vite + Tailwind frontend. See `web/README.md`.

## Run

Both halves, in two terminals. The backend must be up first — the frontend
proxies `/api` to it in dev, and is served by it in production.

```bash
cd server && cp .env.example .env    # set BJJ_KEY + GROQ_API_KEY, then:
.venv/bin/uvicorn app.main:app --reload      # :8000
.venv/bin/python -m pytest                   # tests, never hit the network

cd web && npm run dev                        # :5173
npx tsc -b                                   # typecheck (-b: project references)
npm run build
```

## Conventions

- **Backend**: one SQLite connection per request; `PRAGMA foreign_keys` is set
  per connection because it is not persisted. Repository functions take the
  connection as the first argument and do not commit — routes own the
  transaction boundary and commit before responding.
- **Migrations**: versioned with `user_version`, but additive columns are also
  reconciled against `PRAGMA table_info` on every open. A version counter can
  advance without the `ALTER` landing, and that state is otherwise
  unrecoverable. This bit the mobile app once; don't reintroduce it.
- **JSON-array columns** (`went_well`, `to_improve`, `rounds`, `tags`) are stored
  as TEXT and decoded in `server/app/repositories/sessions.py`.
- **Dedup** is keyed on `name_norm` (trimmed, lowercased, whitespace-collapsed).
  Existing technique names are passed into the structuring prompt so the model
  reuses canonical names. Dedup within a single debrief must happen *before* the
  upsert, or `times_trained` double-counts.
- **Never lose a transcript.** Structuring is retried once; if it still fails the
  session is persisted anyway and the response sets `structuring_failed`.
- **Frontend**: `src/types.ts` mirrors `server/app/models.py` — change them
  together. Server state goes through TanStack Query hooks in `src/lib/queries.ts`.
- **Design tokens** are CSS variables in `web/src/index.css`, mapped to Tailwind
  utilities via `@theme inline`. Light/dark follows the OS with no JS. Keep the
  warm-orange-on-zinc, soft-filled-card look.
- **Mobile-first**: design at 390px, then adapt upward. Inputs stay at 16px or
  iOS zooms on focus.
