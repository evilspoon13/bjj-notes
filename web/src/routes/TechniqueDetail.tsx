import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { DetailHeader } from '@/components/Layout';
import { Button, Card, Chip, ErrorNote, Field, Spinner } from '@/components/ui';
import { shortDate, statDate } from '@/lib/format';
import { useDeleteTechnique, useTechnique, useUpdateTechnique } from '@/lib/queries';
import type { TechniqueDetail as Detail } from '@/types';

export function TechniqueDetail() {
  const id = Number(useParams().id);
  const { data, isPending, error } = useTechnique(id);
  const [editing, setEditing] = useState(false);

  if (isPending) return <Spinner />;
  if (error) return <ErrorNote>{(error as Error).message}</ErrorNote>;

  return editing ? (
    <EditTechnique technique={data} onDone={() => setEditing(false)} />
  ) : (
    <ViewTechnique technique={data} onEdit={() => setEditing(true)} />
  );
}

function ViewTechnique({
  technique,
  onEdit,
}: {
  technique: Detail;
  onEdit: () => void;
}) {
  const remove = useDeleteTechnique();
  const navigate = useNavigate();

  const confirmDelete = async () => {
    const appearances = technique.sessions.length
      ? ` It will also be removed from ${technique.sessions.length} session${
          technique.sessions.length === 1 ? '' : 's'
        }, but those sessions are kept.`
      : '';
    const ok = window.confirm(
      `Delete “${technique.name}” and its notes from your library?${appearances}`
    );
    if (!ok) return;
    await remove.mutateAsync(technique.id);
    navigate('/library');
  };

  return (
    <article className="flex flex-col gap-4">
      <DetailHeader backTo="/library" backLabel="Library">
        <button onClick={onEdit} className="text-sm font-semibold text-accent">
          Edit
        </button>
        <button
          onClick={() => void confirmDelete()}
          className="text-sm font-semibold text-danger"
        >
          Delete
        </button>
      </DetailHeader>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-extrabold">{technique.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {technique.category && <Chip label={technique.category} accent />}
          {technique.position && (
            <span className="text-sm text-fg-muted">{technique.position}</span>
          )}
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2.5">
        <Stat value={`${technique.times_trained}`} label="trained" highlight />
        <Stat value={statDate(technique.first_seen)} label="first" />
        <Stat value={statDate(technique.last_seen)} label="last" />
      </div>

      <Card>
        <h2 className="text-xs font-bold tracking-wide text-fg-faint uppercase">Notes</h2>
        {technique.description ? (
          <p className="whitespace-pre-wrap">{technique.description}</p>
        ) : (
          <button onClick={onEdit} className="text-left text-fg-faint">
            No notes yet. Tap to add the details you couldn’t capture out loud.
          </button>
        )}
      </Card>

      <Card className="!p-2">
        <h2 className="px-2 pt-2 text-xs font-bold tracking-wide text-fg-faint uppercase">
          Appears in {technique.sessions.length} session
          {technique.sessions.length === 1 ? '' : 's'}
        </h2>
        <div className="flex flex-col">
          {technique.sessions.map((session) => (
            <Link
              key={session.session_id}
              to={`/journal/${session.session_id}`}
              className="rounded-xl px-2 py-3 transition-colors hover:bg-surface-active"
            >
              <span className="text-xs font-bold tracking-wide text-accent uppercase">
                {shortDate(session.created_at)}
              </span>
              <p className="line-clamp-2">{session.notes?.trim() || session.title}</p>
            </Link>
          ))}
        </div>
      </Card>
    </article>
  );
}

function Stat({
  value,
  label,
  highlight,
}: {
  value: string;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-0.5 rounded-2xl px-3 py-3.5 ${
        highlight ? 'bg-accent-soft' : 'bg-surface'
      }`}
    >
      <span className={`font-extrabold ${highlight ? 'text-accent' : ''}`}>{value}</span>
      <span
        className={`text-xs font-bold tracking-wide uppercase ${
          highlight ? 'text-accent' : 'text-fg-faint'
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function EditTechnique({ technique, onDone }: { technique: Detail; onDone: () => void }) {
  const [name, setName] = useState(technique.name);
  const [category, setCategory] = useState(technique.category ?? '');
  const [position, setPosition] = useState(technique.position ?? '');
  const [description, setDescription] = useState(technique.description ?? '');
  const update = useUpdateTechnique(technique.id);

  const save = async () => {
    await update.mutateAsync({
      name: name.trim(),
      category: category.trim() || null,
      position: position.trim() || null,
      description: description.trim() || null,
    });
    onDone();
  };

  return (
    <div className="flex flex-col gap-5">
      <DetailHeader backTo="/library" backLabel="Library">
        <button onClick={onDone} className="text-sm font-semibold text-fg-muted">
          Cancel
        </button>
      </DetailHeader>

      <Field label="Name" value={name} onChange={setName} />
      <Field
        label="Category"
        hint="Guard, Passing, Submission, Takedown, Escape, Sweep, Other."
        value={category}
        onChange={setCategory}
      />
      <Field label="Position" value={position} onChange={setPosition} />
      <Field
        label="Notes"
        hint="Details you couldn’t capture out loud."
        value={description}
        onChange={setDescription}
        multiline
      />

      {update.isError && <ErrorNote>{(update.error as Error).message}</ErrorNote>}
      <Button
        onClick={() => void save()}
        loading={update.isPending}
        disabled={!name.trim()}
      >
        Save changes
      </Button>
    </div>
  );
}
