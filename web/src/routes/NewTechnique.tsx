/**
 * Add a technique directly, without a session.
 *
 * Same shape as recording a debrief: write freely, the AI structures it. The
 * result is a reusable library entry — when the move later shows up in a
 * session, it attaches to this same technique instead of creating a new one.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DetailHeader } from '@/components/Layout';
import { Button, ErrorNote, Field } from '@/components/ui';
import { useCreateTechnique } from '@/lib/queries';

export function NewTechnique() {
  const [text, setText] = useState('');
  const create = useCreateTechnique();
  const navigate = useNavigate();

  const submit = async () => {
    const body = text.trim();
    if (!body) return;

    const result = await create.mutateAsync(body);
    if (!result.created) {
      // Enriching an existing entry only fills blanks, so nothing was lost —
      // but say so, or the redirect looks like it created a duplicate.
      window.alert(
        `“${result.technique.name}” was already in your library. ` +
          'Any empty sections were filled in; existing notes were kept.'
      );
    }
    navigate(`/library/${result.technique.id}`);
  };

  return (
    <div className="flex flex-col gap-5">
      <DetailHeader backTo="/library" backLabel="Library" />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold">Add technique</h1>
        <p className="text-sm text-fg-muted">
          Describe the move — how it works, the details that matter, what goes wrong.
          It gets sorted into steps, key details, and tips.
        </p>
      </div>

      <Field
        label="The move"
        value={text}
        onChange={setText}
        multiline
        placeholder="The kimura from half guard. Get the far collar grip, trap the arm, figure-four the wrist. Keep your elbow tight or they slip out…"
      />

      {create.isError && <ErrorNote>{(create.error as Error).message}</ErrorNote>}

      <Button
        onClick={() => void submit()}
        loading={create.isPending}
        disabled={!text.trim()}
      >
        Add to library
      </Button>

      {create.isPending && (
        <p className="text-center text-sm text-fg-muted">
          Organizing with AI — this takes a few seconds.
        </p>
      )}
    </div>
  );
}
