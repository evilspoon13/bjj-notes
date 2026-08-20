/**
 * Record screen.
 *
 * Phase 4 ships the typed/pasted transcript path. Phase 5 adds MediaRecorder
 * above it; the typed path stays as a first-class fallback — it is the escape
 * hatch when a browser misbehaves and the better input on desktop.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, ErrorNote, Field } from '@/components/ui';
import { useCreateSession } from '@/lib/queries';

export function Record() {
  const [transcript, setTranscript] = useState('');
  const create = useCreateSession();
  const navigate = useNavigate();

  const submit = async () => {
    const text = transcript.trim();
    if (!text) return;

    const session = await create.mutateAsync(text);
    setTranscript('');

    // The debrief was saved regardless — say so plainly rather than presenting
    // it as a failure, since nothing was lost. The notice is handed to the
    // session page rather than shown here: this screen unmounts on the
    // navigate below, so anything rendered here would flash and vanish.
    navigate(`/journal/${session.id}`, {
      state: session.structuring_failed
        ? {
            warning:
              'Saved, but the AI could not organize it — you can edit it by hand.',
            detail: session.error,
          }
        : undefined,
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold">New session</h1>
        <p className="text-sm text-fg-muted">
          Write up what you trained. It gets organized into your journal and technique
          library.
        </p>
      </div>

      <Field
        label="Debrief"
        value={transcript}
        onChange={setTranscript}
        multiline
        placeholder="Worked the kimura trap today. Drilled entries off a single leg…"
      />

      {create.isError && <ErrorNote>{(create.error as Error).message}</ErrorNote>}

      <Button
        onClick={() => void submit()}
        loading={create.isPending}
        disabled={!transcript.trim()}
      >
        Save session
      </Button>

      {create.isPending && (
        <p className="text-center text-sm text-fg-muted">
          Organizing with AI — this takes a few seconds.
        </p>
      )}
    </div>
  );
}
