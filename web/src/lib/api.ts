/** Typed fetch wrapper. Attaches the passphrase and normalizes errors. */

import { clearKey, getKey } from './key';
import type {
  CreatedSession,
  CreatedTechnique,
  Sequence,
  Session,
  SessionListItem,
  SessionUpdate,
  Technique,
  TechniqueDetail,
  TechniqueSort,
  TechniqueUpdate,
} from '@/types';

export class ApiError extends Error {
  // Declared explicitly rather than as a constructor parameter property:
  // `erasableSyntaxOnly` disallows the shorthand.
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = getKey();
  const headers = new Headers(init.headers);
  if (key) headers.set('X-BJJ-Key', key);

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch (e) {
    throw new ApiError(
      e instanceof Error ? `Network error: ${e.message}` : 'Network error',
      0
    );
  }

  if (response.status === 401) {
    // The stored passphrase is wrong or was rotated — drop it so the gate shows.
    clearKey();
    throw new ApiError('Wrong passphrase.', 401);
  }

  if (!response.ok) {
    throw new ApiError(await errorMessage(response), response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.detail === 'string') return body.detail;
  } catch {
    /* fall through to the status text */
  }
  return `Request failed (${response.status})`;
}

function json(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export const api = {
  /** Cheap authenticated call used to validate a freshly entered passphrase. */
  check: () => request<SessionListItem[]>('/api/sessions'),

  listSessions: () => request<SessionListItem[]>('/api/sessions'),
  getSession: (id: number) => request<Session>(`/api/sessions/${id}`),

  createSession: (transcript: string) =>
    request<CreatedSession>('/api/sessions', json({ transcript })),

  recordSession: (audio: Blob, filename: string) => {
    const form = new FormData();
    form.append('audio', audio, filename);
    return request<CreatedSession>('/api/sessions/record', {
      method: 'POST',
      body: form,
    });
  },

  updateSession: (id: number, body: SessionUpdate) =>
    request<Session>(`/api/sessions/${id}`, { ...json(body), method: 'PATCH' }),

  deleteSession: (id: number) =>
    request<void>(`/api/sessions/${id}`, { method: 'DELETE' }),

  listTechniques: (params: { search?: string; sort?: TechniqueSort } = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.sort) query.set('sort', params.sort);
    const suffix = query.toString() ? `?${query}` : '';
    return request<Technique[]>(`/api/techniques${suffix}`);
  },

  getTechnique: (id: number) => request<TechniqueDetail>(`/api/techniques/${id}`),

  createTechnique: (text: string) =>
    request<CreatedTechnique>('/api/techniques', json({ text })),

  listSequences: (search?: string) => {
    const suffix = search ? `?search=${encodeURIComponent(search)}` : '';
    return request<Sequence[]>(`/api/sequences${suffix}`);
  },

  deleteSequence: (id: number) =>
    request<void>(`/api/sequences/${id}`, { method: 'DELETE' }),

  updateTechnique: (id: number, body: TechniqueUpdate) =>
    request<TechniqueDetail>(`/api/techniques/${id}`, { ...json(body), method: 'PATCH' }),

  deleteTechnique: (id: number) =>
    request<void>(`/api/techniques/${id}`, { method: 'DELETE' }),
};
