import { useState } from 'react';

import { SequenceCard } from '@/components/SequenceCard';
import { EmptyState, ErrorNote, Spinner } from '@/components/ui';
import { useDeleteSequence, useSequences } from '@/lib/queries';

export function Sequences() {
  const [search, setSearch] = useState('');
  const { data, isPending, error } = useSequences(search.trim());
  const remove = useDeleteSequence();

  const confirmDelete = async (id: number) => {
    if (!window.confirm('Delete this sequence? The session itself is kept.')) return;
    await remove.mutateAsync(id);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold">Sequences</h1>
        <p className="text-sm text-fg-muted">
          The step-by-step chains — grips, motions, and the order of them.
        </p>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search steps, names, techniques"
        type="search"
        className="w-full rounded-card bg-surface px-4 py-3 outline-none placeholder:text-fg-faint focus:ring-2 focus:ring-accent"
      />

      {isPending && <Spinner />}
      {error && <ErrorNote>{(error as Error).message}</ErrorNote>}

      {data && data.length === 0 && (
        <EmptyState
          title={search ? 'No matches' : 'No sequences yet'}
          subtitle={
            search
              ? 'Try a different search.'
              : 'Describe a chain of grips and movements in a debrief — “grip the collar, turn the hands, circle out” — and it gets pulled out here.'
          }
        />
      )}

      {data && data.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((sequence) => (
            <SequenceCard
              key={sequence.id}
              sequence={sequence}
              context="session"
              onDelete={(id) => void confirmDelete(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
