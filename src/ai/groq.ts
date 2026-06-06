/**
 * Groq API client: transcription (Whisper) + structuring (LLM, JSON mode).
 * OpenAI-compatible endpoints (plan §5.2, §5.3, §11).
 *
 * The API key is read from SecureStore by the caller and passed in, so this
 * module has no knowledge of where the secret lives.
 */

import { SYSTEM_PROMPT } from './prompts';
import type { Round, StructuredSession } from '@/db/types';

const GROQ_BASE = 'https://api.groq.com/openai/v1';

export class GroqError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'GroqError';
  }
}

/**
 * Transcribe an audio file with Groq Whisper. `uri` is a local file URI
 * (`.m4a` from the recorder). Returns the verbatim transcript text.
 */
export async function transcribe(
  uri: string,
  opts: { apiKey: string; model: string }
): Promise<string> {
  const form = new FormData();
  // React Native FormData file shape.
  form.append('file', { uri, name: 'session.m4a', type: 'audio/m4a' } as any);
  form.append('model', opts.model);
  form.append('response_format', 'text');
  form.append('language', 'en');

  let res: Response;
  try {
    res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
      method: 'POST',
      // Do NOT set Content-Type; let fetch set the multipart boundary.
      headers: { Authorization: `Bearer ${opts.apiKey}` },
      body: form,
    });
  } catch (e) {
    throw new GroqError(
      `Network error during transcription: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  if (!res.ok) {
    throw new GroqError(`Transcription failed (${res.status}): ${await res.text()}`, res.status);
  }
  return (await res.text()).trim();
}

/**
 * Structure a transcript into the session schema using Groq's chat completions
 * with JSON mode. `existingTechniqueNames` are passed so the model reuses
 * canonical names (dedup).
 */
export async function structure(
  transcript: string,
  existingTechniqueNames: string[],
  opts: { apiKey: string; model: string }
): Promise<StructuredSession> {
  let res: Response;
  try {
    res = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: JSON.stringify({
              transcript,
              existing_techniques: existingTechniqueNames,
            }),
          },
        ],
      }),
    });
  } catch (e) {
    throw new GroqError(
      `Network error during structuring: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  if (!res.ok) {
    throw new GroqError(`Structuring failed (${res.status}): ${await res.text()}`, res.status);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new GroqError('Structuring returned no content.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new GroqError('Structuring returned malformed JSON.');
  }

  return normalizeStructured(parsed);
}

/** Coerce the model output into a well-formed StructuredSession, tolerating omissions. */
function normalizeStructured(raw: unknown): StructuredSession {
  const obj = (raw ?? {}) as Record<string, unknown>;

  const stringArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

  const rounds: Round[] = Array.isArray(obj.rounds)
    ? obj.rounds.map((r) => {
        const ro = (r ?? {}) as Record<string, unknown>;
        return {
          partner: typeof ro.partner === 'string' ? ro.partner : null,
          outcome: typeof ro.outcome === 'string' ? ro.outcome : null,
          notes: typeof ro.notes === 'string' ? ro.notes : '',
        };
      })
    : [];

  const techniques = Array.isArray(obj.techniques)
    ? obj.techniques
        .map((t) => {
          const to = (t ?? {}) as Record<string, unknown>;
          return {
            name: typeof to.name === 'string' ? to.name : '',
            category: typeof to.category === 'string' ? to.category : 'Other',
            position: typeof to.position === 'string' ? to.position : null,
            session_notes: typeof to.session_notes === 'string' ? to.session_notes : '',
          };
        })
        .filter((t) => t.name.trim().length > 0)
    : [];

  return {
    summary: typeof obj.summary === 'string' ? obj.summary : '',
    went_well: stringArray(obj.went_well),
    to_improve: stringArray(obj.to_improve),
    tags: stringArray(obj.tags),
    rounds,
    techniques,
  };
}
