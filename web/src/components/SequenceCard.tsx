/**
 * A sequence rendered as ordered steps — used on the Sequences tab, the session
 * detail, and the technique detail, so it lives in one place.
 *
 * The steps are the point. They get the numbered list and the full width; the
 * name, position, and linked technique are framing around them.
 */

import { Link } from 'react-router-dom';

import { Card, Chip } from './ui';
import { shortDate } from '@/lib/format';
import type { Sequence } from '@/types';

export function SequenceCard({
  sequence,
  context = 'none',
  onDelete,
}: {
  sequence: Sequence;
  /** Which bit of provenance to show — omit whichever the page already states. */
  context?: 'session' | 'technique' | 'none';
  onDelete?: (id: number) => void;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-bold">{sequence.name}</h3>
        {onDelete && (
          <button
            onClick={() => onDelete(sequence.id)}
            className="shrink-0 text-xs font-semibold text-danger"
            aria-label={`Delete ${sequence.name}`}
          >
            Delete
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {sequence.position && <Chip label={`from ${sequence.position}`} />}
        {context === 'technique' && sequence.technique_name && (
          <Link
            to={`/library/${sequence.technique_id}`}
            className="text-xs font-semibold text-accent"
          >
            → {sequence.technique_name}
          </Link>
        )}
      </div>

      <ol className="flex flex-col gap-1.5">
        {sequence.steps.map((step, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-0.5 w-5 shrink-0 text-xs font-bold text-accent tabular-nums">
              {i + 1}.
            </span>
            <span className="text-sm">{step}</span>
          </li>
        ))}
      </ol>

      {sequence.notes && (
        <p className="text-sm text-fg-muted italic">{sequence.notes}</p>
      )}

      {context === 'session' && (
        <Link
          to={`/journal/${sequence.session_id}`}
          className="text-xs font-semibold text-fg-faint"
        >
          {shortDate(sequence.created_at)} · {sequence.session_title}
        </Link>
      )}
    </Card>
  );
}
