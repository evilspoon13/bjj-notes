# BJJ Notes

Voice-driven Brazilian Jiu-Jitsu training journal (iOS, Expo SDK 54, TypeScript).
After training you record a spoken debrief; the app transcribes it (Groq Whisper),
structures it (Groq LLM, JSON mode), and stores it on-device as both a session
journal and a deduplicated technique library. Fully offline after transcription.
Personal single-user app — no auth, no cloud sync.

See `BJJ_NOTES_APP_PLAN.md` for the full design and locked decisions.
Expo has changed a lot — read the versioned docs at
https://docs.expo.dev/versions/v54.0.0/ before writing code against the SDK.
The project targets SDK 54 to stay compatible with App Store Expo Go — do not
upgrade the SDK past what Expo Go supports.

## Run

```bash
npm start              # expo start, scan QR with Expo Go on iPhone
npx tsc --noEmit       # typecheck
npx expo lint          # lint
```

Add a Groq API key (free: https://console.groq.com/keys) in the in-app Settings
screen before recording. The key is stored only in expo-secure-store.

## Layout (under src/)

- `app/` — expo-router routes. `(tabs)/` = Record/Journal/Library; `settings`,
  `session/[id]`, `session/edit/[id]`, `technique/[id]` are stacked screens.
- `db/` — `schema.ts` (DDL + user_version migrations), `sessions.ts`,
  `techniques.ts` (dedup upsert), `types.ts`.
- `ai/` — `groq.ts` (transcribe/structure), `prompts.ts`, `pipeline.ts`
  (record→transcribe→structure→persist orchestration).
- `audio/useRecorder.ts` — expo-audio wrapper.
- `lib/secrets.ts` — SecureStore for the Groq key + model ids.
- `components/`, `hooks/`, `constants/` — UI primitives and theming.

## Conventions

- SQLite accessed via `useSQLiteContext()`; DB helpers take the `db` as first arg.
- JSON-array columns (`went_well`, `to_improve`, `rounds`, `tags`) are stored as
  TEXT and parsed in `db/sessions.ts`.
- Screens reload data with `useFocusEffect`.
- iOS-only; do not add native modules that break Expo Go compatibility.
