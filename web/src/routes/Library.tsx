import { useState } from 'react';

import { Card, Chip, EmptyState, ErrorNote, Spinner, cx } from '@/components/ui';
import { statDate } from '@/lib/format';
import { useTechniques } from '@/lib/queries';
import type { TechniqueSort } from '@/types';

const SORTS: { value: TechniqueSort; label: string }[] = [
  { value: 'recency', label: 'Recent' },
  { value: 'frequency', label: 'Most trained' },
  { value: 'name', label: 'A–Z' },
];

export function Library() {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<TechniqueSort>('recency');
  const { data, isPending, error } = useTechniques({ search: search.trim(), sort });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-extrabold">Library</h1>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search techniques"
        type="search"
        className="w-full rounded-card bg-surface px-4 py-3 outline-none placeholder:text-fg-faint focus:ring-2 focus:ring-accent"
      />

      <div className="flex gap-2">
        {SORTS.map((option) => (
          <button
            key={option.value}
            onClick={() => setSort(option.value)}
            className={cx(
              'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
              sort === option.value
                ? 'bg-accent-soft text-accent'
                : 'bg-surface text-fg-muted'
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {isPending && <Spinner />}
      {error && <ErrorNote>{(error as Error).message}</ErrorNote>}

      {data && data.length === 0 && (
        <EmptyState
          title={search ? 'No matches' : 'No techniques yet'}
          subtitle={
            search
              ? 'Try a different search.'
              : 'Techniques are added automatically from your session debriefs.'
          }
        />
      )}

      {data && data.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((technique) => (
            <Card key={technique.id} to={`/library/${technique.id}`}>
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-bold">{technique.name}</h2>
                <span className="shrink-0 text-sm font-bold text-accent">
                  {technique.times_trained}×
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {technique.category && <Chip label={technique.category} accent />}
                {technique.position && (
                  <span className="text-sm text-fg-muted">{technique.position}</span>
                )}
              </div>
              <p className="text-xs text-fg-faint">
                Last trained {statDate(technique.last_seen)}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
