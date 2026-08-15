/**
 * Passphrase gate. Blocks the app until a key that the server accepts is stored.
 *
 * The key is verified with a real request rather than trusted from storage, so
 * a rotated or mistyped passphrase surfaces here instead of as failures on
 * every screen.
 */

import { useEffect, useState, type ReactNode } from 'react';

import { api, ApiError } from '@/lib/api';
import { getKey, setKey, subscribe } from '@/lib/key';
import { Button, ErrorNote, Field, Spinner } from './ui';

type Status = 'checking' | 'locked' | 'unlocked';

export function KeyGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(getKey() ? 'checking' : 'locked');
  const [entry, setEntry] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Verify whatever is already stored on first load.
  useEffect(() => {
    if (!getKey()) return;
    let cancelled = false;
    api
      .check()
      .then(() => !cancelled && setStatus('unlocked'))
      .catch(() => !cancelled && setStatus('locked'));
    return () => {
      cancelled = true;
    };
  }, []);

  // A 401 anywhere in the app clears the key; fall back to the gate.
  useEffect(() => subscribe((key) => !key && setStatus('locked')), []);

  const unlock = async () => {
    const candidate = entry.trim();
    if (!candidate) return;

    setSubmitting(true);
    setError(null);
    setKey(candidate);
    try {
      await api.check();
      setEntry('');
      setStatus('unlocked');
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 401
          ? 'That passphrase was rejected.'
          : e instanceof Error
            ? e.message
            : 'Could not reach the server.'
      );
      setStatus('locked');
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'checking') return <Spinner label="Unlocking…" />;

  if (status === 'locked') {
    return (
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-5 p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-extrabold">BJJ Notes</h1>
          <p className="text-sm text-fg-muted">Enter the passphrase to continue.</p>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void unlock();
          }}
        >
          <Field
            label="Passphrase"
            type="password"
            value={entry}
            onChange={setEntry}
            autoFocus
          />
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button type="submit" loading={submitting}>
            Unlock
          </Button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
