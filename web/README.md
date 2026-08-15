# BJJ Notes — frontend

React + Vite + TypeScript + Tailwind v4. Mobile-first, desktop-usable.
See `../BJJ_NOTES_WEB_PLAN.md` for the full design.

**Phase 4 is complete**: shell, design tokens, passphrase gate, journal and
library screens with inline editing, and backup download. Phase 5 adds
microphone recording; the typed-transcript path already works.

## Run

Needs the backend running on port 8000 (see `../server/README.md`) — `/api` is
proxied there in dev, and same-origin in production.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/, served by FastAPI in production
npx tsc -b         # typecheck (use -b: the root config is a project reference)
```

On first load the app asks for the passphrase (the server's `BJJ_KEY`). It's
verified with a real request, then kept in localStorage. Any 401 clears it and
returns you to the gate.

## Layout

- `src/lib/api.ts` — typed fetch wrapper; attaches the key, normalizes errors
- `src/lib/key.ts` — passphrase storage + subscribers
- `src/lib/queries.ts` — TanStack Query hooks
- `src/lib/format.ts` — dates via `Intl`, no date library
- `src/components/ui.tsx` — Card / Chip / Section / Button / Field / EmptyState
- `src/components/KeyGate.tsx` — passphrase gate
- `src/components/Layout.tsx` — bottom tabs on mobile, top nav from `md`
- `src/routes/` — Record, Journal, SessionDetail, Library, TechniqueDetail, Settings
- `src/types.ts` — mirrors `server/app/models.py`

## Notes

- Design tokens are CSS variables in `index.css`, mapped to Tailwind utilities
  via `@theme inline`, so light/dark follows the OS with no JS.
- Inputs are 16px: iOS zooms the page on focus below that.
- The tab bar pads with `env(safe-area-inset-bottom)` and the viewport uses
  `viewport-fit=cover`, so it clears the iOS home indicator.
- The backup button fetches and saves a blob rather than using a plain link —
  a link can't send the passphrase header.
