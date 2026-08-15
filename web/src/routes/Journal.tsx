import { Link } from 'react-router-dom';

import { Card, Chip, EmptyState, ErrorNote, Spinner } from '@/components/ui';
import { shortDate } from '@/lib/format';
import { useSessions } from '@/lib/queries';

export function Journal() {
  const { data, isPending, error } = useSessions();

  if (isPending) return <Spinner />;
  if (error) return <ErrorNote>{(error as Error).message}</ErrorNote>;

  if (data.length === 0) {
    return (
      <EmptyState
        title="No sessions yet"
        subtitle="Write up a debrief on the Record tab and it will show up here."
        action={
          <Link to="/" className="font-semibold text-accent">
            Record one →
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-2xl font-extrabold">Journal</h1>

      <div className="grid gap-3 md:grid-cols-2">
        {data.map((session) => (
          <Card key={session.id} to={`/journal/${session.id}`}>
            <span className="text-xs font-bold tracking-wide text-accent uppercase">
              {shortDate(session.created_at)}
            </span>
            <h2 className="truncate text-lg font-bold">{session.title}</h2>
            {session.summary && (
              <p className="line-clamp-2 text-sm text-fg-muted">{session.summary}</p>
            )}
            {session.tags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {session.tags.slice(0, 4).map((tag) => (
                  <Chip key={tag} label={tag} />
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
