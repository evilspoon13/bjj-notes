# BJJ Training Notes — Build Plan (Claude Code Handoff)

> Voice-driven Brazilian Jiu-Jitsu training journal. After each session the user
> records a spoken debrief; the app transcribes it, an LLM structures it, and the
> results are stored on-device as both a **chronological session journal** and a
> growing, deduplicated **technique library**. All data lives inside the app.

---

## 1. Locked Decisions

| Decision | Choice | Notes |
|---|---|---|
| Framework | React Native via **Expo (managed / CNG)**, SDK 54+ | No Mac required to build or run. |
| Platform | **iOS only** | Android is free to add later (same codebase) but is out of scope. |
| Users | **Personal — one user, the owner** | No auth, no multi-user, no cloud sync. |
| Organization | **Combined**: session journal **and** technique library | One voice note populates both. |
| AI provider | **Groq** (free tier, no credit card) | OpenAI-compatible API. |
| Transcription | `whisper-large-v3` | More accurate on BJJ/Portuguese jargon than `-turbo`. |
| Structuring | `llama-3.3-70b-versatile` with JSON mode | Flagship Groq chat model, strong at structured output. |
| Storage | **`expo-sqlite`** (on-device relational DB) | Notes live in the app, fully offline once transcribed. |
| Secrets | **`expo-secure-store`** | User pastes their own Groq key in a Settings screen. |
| Navigation | **`expo-router`** (file-based) | Current Expo default. |

---

## 2. The "iOS without a Mac" reality — pick a run path

This is the single most important practical constraint, so it's spelled out explicitly.
**Everything in this app is pure Expo SDK**, so all of it works in Expo Go.

**Path A — Expo Go (recommended start, $0, no Mac, no Apple account)**
- Install **Expo Go** from the App Store on the user's iPhone.
- Dev: `npx expo start`, scan the QR code, app loads inside Expo Go.
- For untethered daily use, publish to a channel with `eas update` so it loads in
  Expo Go without a running dev server.
- Limitation: app launches *through* Expo Go rather than as its own home-screen icon.

**Path B — Standalone build (real app icon, needs Apple Developer Program, ~$99/yr)**
- `eas build -p ios --profile preview` builds **in the cloud** (still no Mac needed).
- Install on device via EAS internal distribution (ad-hoc provisioning) or TestFlight.
- Requires enrolling the iPhone's UDID and an Apple Developer account.

**Build order implication:** develop and ship the whole app against **Path A first.**
Treat Path B as an optional final packaging step. Do **not** introduce any native
module that breaks Expo Go compatibility.

---

## 3. Tech Stack & Dependencies

```bash
# scaffold
npx create-expo-app@latest bjj-notes --template default   # TypeScript, expo-router
cd bjj-notes

# core capabilities
npx expo install expo-audio          # recording (replaces deprecated expo-av)
npx expo install expo-sqlite         # local relational DB
npx expo install expo-secure-store   # Groq API key storage
npx expo install expo-file-system    # temp audio file handling
npx expo install expo-router         # (usually preinstalled by template)

# UI niceties (optional but recommended)
npx expo install @expo/vector-icons
npm i date-fns                       # date formatting for the journal
```

`app.json` config plugin for microphone permission:

```json
{
  "expo": {
    "plugins": [
      ["expo-audio", { "microphonePermission": "Record your post-training debriefs." }]
    ],
    "ios": { "infoPlist": { "NSMicrophoneUsageDescription": "Record your post-training debriefs." } }
  }
}
```

---

## 4. Data Model (SQLite)

Three tables: `sessions` (the journal), `techniques` (the library), and a
`session_techniques` join (a session references techniques; a technique
accumulates across sessions).

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at      TEXT NOT NULL,              -- ISO 8601
  raw_transcript  TEXT NOT NULL,              -- verbatim Whisper output
  summary         TEXT,                       -- 1-2 sentence LLM summary
  went_well       TEXT,                       -- JSON array of strings
  to_improve      TEXT,                       -- JSON array of strings
  rounds          TEXT,                       -- JSON array of round objects
  tags            TEXT                        -- JSON array of strings
);

CREATE TABLE IF NOT EXISTS techniques (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,              -- canonical display name
  name_norm       TEXT NOT NULL UNIQUE,       -- lowercased/trimmed for dedup
  category        TEXT,                       -- e.g. Guard, Passing, Submission, Takedown, Escape, Sweep
  position        TEXT,                       -- e.g. "Closed guard", "Side control"
  description     TEXT,                       -- aggregated/merged details
  times_trained   INTEGER NOT NULL DEFAULT 0,
  first_seen      TEXT NOT NULL,
  last_seen       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_techniques (
  session_id      INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  technique_id    INTEGER NOT NULL REFERENCES techniques(id) ON DELETE CASCADE,
  notes           TEXT,                       -- session-specific details about this technique
  PRIMARY KEY (session_id, technique_id)
);
```

`went_well`, `to_improve`, `rounds`, and `tags` are stored as JSON strings
(SQLite has no array type). Parse on read.

---

## 5. The AI Pipeline (the heart of the app)

Flow: **record → transcribe (Groq Whisper) → structure (Groq LLM, JSON) → persist → display**

### 5.1 Record (expo-audio)

```ts
import {
  useAudioRecorder, useAudioRecorderState, RecordingPresets,
  AudioModule, setAudioModeAsync,
} from 'expo-audio';

const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
const state = useAudioRecorderState(recorder);

// on mount: await AudioModule.requestRecordingPermissionsAsync();
//           await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });

const start = async () => { await recorder.prepareToRecordAsync(); recorder.record(); };
const stop  = async () => { await recorder.stop(); return recorder.uri; }; // -> .m4a file URI
```

### 5.2 Transcribe — Groq Whisper

OpenAI-compatible endpoint, multipart upload. `.m4a` is a supported format.

```ts
async function transcribe(uri: string, apiKey: string): Promise<string> {
  const form = new FormData();
  // React Native FormData file shape:
  form.append('file', { uri, name: 'session.m4a', type: 'audio/m4a' } as any);
  form.append('model', 'whisper-large-v3');
  form.append('response_format', 'text');
  form.append('language', 'en'); // debriefs are in English even if technique names aren't

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` }, // do NOT set Content-Type; let fetch set the boundary
    body: form,
  });
  if (!res.ok) throw new Error(`Transcription failed: ${res.status} ${await res.text()}`);
  return (await res.text()).trim();
}
```

### 5.3 Structure — Groq LLM with JSON mode

Pass the **list of existing technique names** into the prompt so the model reuses
canonical names where a technique already exists (this is the dedup strategy —
keep it in one call, no separate matching step).

```ts
async function structure(transcript: string, existingTechniqueNames: string[], apiKey: string) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify({ transcript, existing_techniques: existingTechniqueNames }) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Structuring failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content); // matches schema in 5.4
}
```

### 5.4 Required output schema

The system prompt must instruct the model to return **exactly** this JSON shape:

```json
{
  "summary": "string — 1-2 sentence recap of the session",
  "went_well": ["string", "..."],
  "to_improve": ["string", "..."],
  "tags": ["string", "..."],
  "rounds": [
    { "partner": "string|null", "outcome": "string|null", "notes": "string" }
  ],
  "techniques": [
    {
      "name": "string — REUSE an existing_techniques name verbatim if it matches, else a new canonical name",
      "category": "Guard | Passing | Submission | Takedown | Escape | Sweep | Other",
      "position": "string|null",
      "session_notes": "string — what was learned/drilled about this technique today"
    }
  ]
}
```

### 5.5 System prompt (starting point — refine during build)

```
You are a Brazilian Jiu-Jitsu training-log assistant. You receive a JSON object with
a `transcript` (a spoken post-training debrief) and `existing_techniques` (an array of
technique names already in the user's library).

Extract and organize the debrief. Return ONLY a single JSON object, no prose, no markdown.

Rules:
- Identify every distinct technique mentioned. For each, if it clearly matches an entry in
  existing_techniques, reuse that exact name. Otherwise create a concise canonical name
  (e.g. "Armbar from closed guard", "Berimbolo", "Knee cut pass").
- Preserve Portuguese/standard BJJ terminology (berimbolo, de la riva, kimura, etc.) — do
  not anglicize or "correct" it.
- `went_well` and `to_improve` capture the user's self-assessment of their rolling.
- `rounds` captures sparring rounds if described; use null for unknown fields.
- `tags` are short topical labels (e.g. "guard retention", "leg locks").
- If something is not present in the transcript, use an empty array or null. Never invent.
```

### 5.6 Persist

After parsing the JSON:
1. Insert one `sessions` row (`went_well`, `to_improve`, `rounds`, `tags` JSON-stringified).
2. For each technique: look up `name_norm`; **upsert** — if it exists, `times_trained += 1`
   and update `last_seen` (optionally append/merge `description`); else insert with
   `times_trained = 1`, `first_seen = last_seen = now`.
3. Insert `session_techniques` join rows with `session_notes`.

Wrap steps 1–3 in a single SQLite transaction.

---

## 6. App Structure & Screens

```
app/
  _layout.tsx              # expo-router root, tab navigator
  (tabs)/
    index.tsx              # RECORD screen — big mic button, recording state, "processing" status
    journal.tsx            # SESSION JOURNAL — reverse-chronological list of sessions
    library.tsx            # TECHNIQUE LIBRARY — searchable/filterable list, sort by recency/frequency
  session/[id].tsx         # session detail (summary, went well, to improve, rounds, linked techniques)
  technique/[id].tsx       # technique detail (description, times trained, list of sessions it appeared in)
  settings.tsx             # paste/save Groq API key, choose models, clear data
db/
  schema.ts                # DDL + migrations
  sessions.ts              # session queries
  techniques.ts            # technique upsert/query helpers
ai/
  groq.ts                  # transcribe() + structure()
  prompts.ts               # SYSTEM_PROMPT
audio/
  useRecorder.ts           # expo-audio wrapper hook
lib/
  secrets.ts               # SecureStore get/set for the API key
```

### Record screen UX (the daily-use core)
- One large mic button: tap to start, tap to stop.
- On stop, show a pipeline status: `Transcribing… → Organizing… → Saved ✓`.
- Show the raw transcript before/after structuring so the user can verify Whisper got it right.
- On success, route to the new `session/[id]` detail.
- Handle: missing API key (prompt to open Settings), network failure, malformed JSON
  (retry the structuring call once, then surface the raw transcript so nothing is lost).

---

## 7. Secrets Handling

- **Never commit a Groq key. Never bake it into the bundle.**
- The Settings screen accepts the user's key and stores it via `expo-secure-store`.
- `ai/groq.ts` reads the key from SecureStore at call time.
- This is acceptable because the key only ever lives on the owner's own device.
- Add a "Get a free key" link in Settings pointing to `https://console.groq.com/keys`.

---

## 8. Build Order (milestones for Claude Code)

1. **Scaffold + navigation** — Expo app, tab layout, empty Record/Journal/Library/Settings screens, runs in Expo Go.
2. **SQLite layer** — schema + migrations + query helpers, verified with seed data.
3. **Settings + secrets** — paste/save/clear Groq key in SecureStore.
4. **Recording** — `expo-audio` hook, mic permission, produces a playable `.m4a` URI.
5. **Transcription** — wire `transcribe()` to Groq Whisper; display raw transcript.
6. **Structuring** — wire `structure()` with JSON mode; render parsed object before saving.
7. **Persistence** — transaction that writes session + upserts techniques + join rows.
8. **Journal + detail screens** — reverse-chronological list, session detail view.
9. **Library + detail screens** — searchable technique list (sort by frequency/recency), technique detail with linked sessions.
10. **Polish** — loading/error states, empty states, edit/delete a session, pull-to-refresh.
11. *(Optional)* **Path B packaging** — `eas build -p ios` if a standalone app icon is wanted.

---

## 9. Definition of Done

- [ ] Runs in Expo Go on a physical iPhone with no Mac and no paid Apple account.
- [ ] User records a spoken debrief, sees the transcript, and sees it organized into a saved session.
- [ ] The same recording populates both the Journal (the session) and the Library (its techniques).
- [ ] Re-mentioning a known technique increments `times_trained` instead of creating a duplicate.
- [ ] All data persists across app restarts (SQLite) and works fully offline after transcription.
- [ ] The Groq key is stored only in SecureStore, never in source or the bundle.
- [ ] Network/permission/malformed-response failures are handled without losing the transcript.

---

## 10. Open Questions / Future Enhancements (out of scope for v1)

- Manual text-entry fallback when offline (queue audio, transcribe later).
- Weekly/monthly LLM-generated progress summaries across sessions.
- Export to Markdown/JSON; optional backup to iCloud or a file.
- Android target (same codebase — just add the build profile).
- Linking techniques to each other (e.g. "this sweep sets up that pass").

---

## 11. Reference

- Groq API base (OpenAI-compatible): `https://api.groq.com/openai/v1`
  - Transcriptions: `POST /audio/transcriptions` (multipart)
  - Chat: `POST /chat/completions` (supports `response_format: { type: "json_object" }`)
- Groq free tier: no credit card; per-organization rate limits (Whisper ~2,000 requests/day),
  comfortably above one-session-per-day personal use.
- `expo-audio` recorder API: `useAudioRecorder`, `RecordingPresets`, `AudioModule.requestRecordingPermissionsAsync`, `setAudioModeAsync`.
- `expo-av` is deprecated and removed in SDK 55 — do not use it.
