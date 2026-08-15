import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { DetailHeader } from '@/components/Layout';
import { Button, Card, Chip, ErrorNote, Field, Spinner } from '@/components/ui';
import { longDate } from '@/lib/format';
import { useDeleteSession, useSession, useUpdateSession } from '@/lib/queries';
import type { Session } from '@/types';

export function SessionDetail() {
  const id = Number(useParams().id);
  const { data, isPending, error } = useSession(id);
  const [editing, setEditing] = useState(false);

  if (isPending) return <Spinner />;
  if (error) return <ErrorNote>{(error as Error).message}</ErrorNote>;

  return editing ? (
    <EditSession session={data} onDone={() => setEditing(false)} />
  ) : (
    <ViewSession session={data} onEdit={() => setEditing(true)} />
  );
}

function ViewSession({ session, onEdit }: { session: Session; onEdit: () => void }) {
  const remove = useDeleteSession();
  const navigate = useNavigate();

  const confirmDelete = async () => {
    const ok = window.confirm(
      'Delete this session? Techniques it added are removed from your library too, ' +
        'unless another session also used them.'
    );
    if (!ok) return;
    await remove.mutateAsync(session.id);
    navigate('/journal');
  };

  return (
    <article className="flex flex-col gap-4">
      <DetailHeader backTo="/journal" backLabel="Journal">
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
        <span className="text-xs font-bold tracking-wide text-accent uppercase">
          {longDate(session.created_at)}
        </span>
        <h1 className="text-2xl font-extrabold">{session.title}</h1>
        {session.summary && <p className="text-fg-muted">{session.summary}</p>}
        {session.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {session.tags.map((tag) => (
              <Chip key={tag} label={tag} accent />
            ))}
          </div>
        )}
      </header>

      <BulletCard title="What went well" items={session.went_well} tone="success" />
      <BulletCard title="To improve" items={session.to_improve} tone="accent" />

      {session.rounds.length > 0 && (
        <Card>
          <h2 className="text-xs font-bold tracking-wide text-fg-faint uppercase">Rounds</h2>
          {session.rounds.map((round, i) => (
            <div key={i} className="flex flex-col gap-0.5 py-1">
              <p className="font-semibold">
                {[round.partner, round.outcome].filter(Boolean).join('  ·  ') ||
                  `Round ${i + 1}`}
              </p>
              {round.notes && <p className="text-sm text-fg-muted">{round.notes}</p>}
            </div>
          ))}
        </Card>
      )}

      {session.techniques.length > 0 && (
        <Card className="!p-2">
          <h2 className="px-2 pt-2 text-xs font-bold tracking-wide text-fg-faint uppercase">
            Techniques
          </h2>
          <div className="flex flex-col">
            {session.techniques.map((technique) => (
              <Link
                key={technique.technique_id}
                to={`/library/${technique.technique_id}`}
                className="rounded-xl px-2 py-3 transition-colors hover:bg-surface-active"
              >
                <p className="font-semibold">{technique.name}</p>
                {technique.notes && (
                  <p className="text-sm text-fg-muted">{technique.notes}</p>
                )}
              </Link>
            ))}
          </div>
        </Card>
      )}

      <details className="rounded-card bg-surface p-4">
        <summary className="cursor-pointer text-xs font-bold tracking-wide text-fg-faint uppercase">
          Raw transcript
        </summary>
        <p className="mt-3 text-sm whitespace-pre-wrap text-fg-muted">
          {session.raw_transcript}
        </p>
      </details>
    </article>
  );
}

function BulletCard({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: 'success' | 'accent';
}) {
  if (items.length === 0) return null;
  return (
    <Card>
      <h2 className="text-xs font-bold tracking-wide text-fg-faint uppercase">{title}</h2>
      <ul className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className={tone === 'success' ? 'text-success' : 'text-accent'}>•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const toLines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

function EditSession({ session, onDone }: { session: Session; onDone: () => void }) {
  const [title, setTitle] = useState(session.title);
  const [summary, setSummary] = useState(session.summary ?? '');
  const [wentWell, setWentWell] = useState(session.went_well.join('\n'));
  const [toImprove, setToImprove] = useState(session.to_improve.join('\n'));
  const [tags, setTags] = useState(session.tags.join(', '));
  const update = useUpdateSession(session.id);

  const save = async () => {
    await update.mutateAsync({
      title: title.trim() || null,
      summary: summary.trim() || null,
      went_well: toLines(wentWell),
      to_improve: toLines(toImprove),
      tags: tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    });
    onDone();
  };

  return (
    <div className="flex flex-col gap-5">
      <DetailHeader backTo="/journal" backLabel="Journal">
        <button onClick={onDone} className="text-sm font-semibold text-fg-muted">
          Cancel
        </button>
      </DetailHeader>

      <Field
        label="Title"
        hint="Short headline for the journal list."
        value={title}
        onChange={setTitle}
        maxLength={52}
      />
      <Field label="Summary" value={summary} onChange={setSummary} multiline />
      <Field
        label="What went well"
        hint="One item per line."
        value={wentWell}
        onChange={setWentWell}
        multiline
      />
      <Field
        label="To improve"
        hint="One item per line."
        value={toImprove}
        onChange={setToImprove}
        multiline
      />
      <Field label="Tags" hint="Comma-separated." value={tags} onChange={setTags} />

      {update.isError && <ErrorNote>{(update.error as Error).message}</ErrorNote>}
      <Button onClick={() => void save()} loading={update.isPending}>
        Save changes
      </Button>
    </div>
  );
}
