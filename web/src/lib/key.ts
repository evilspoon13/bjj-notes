/**
 * The passphrase, held in localStorage.
 *
 * This is a door lock, not authentication — one shared secret that keeps the
 * public URL from being world-readable and stops anyone else spending the Groq
 * quota. Treat it accordingly: it is not a login, and there is no user identity
 * behind it.
 */

const STORAGE_KEY = 'bjj-notes-key';

type Listener = (key: string | null) => void;
const listeners = new Set<Listener>();

export function getKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // Safari private mode can throw on storage access.
  }
}

export function setKey(key: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    /* ignore — the app still works for this session via the in-memory value */
  }
  listeners.forEach((listener) => listener(key));
}

export function clearKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((listener) => listener(null));
}

/** Subscribe to key changes so the gate can re-render on sign-in/out. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
