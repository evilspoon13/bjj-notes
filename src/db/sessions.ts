/**
 * Session journal queries + the persist transaction that writes a structured
 * session and folds its techniques into the library (plan §5.6).
 */

import type { SQLiteDatabase } from 'expo-sqlite';

import { upsertTechnique } from './techniques';
import type {
  Round,
  Session,
  SessionRow,
  SessionTechnique,
  StructuredSession,
} from './types';

function parseArray(json: string | null): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function parseRounds(json: string | null): Round[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function mapSession(row: SessionRow): Session {
  return {
    id: row.id,
    createdAt: row.created_at,
    rawTranscript: row.raw_transcript,
    summary: row.summary,
    wentWell: parseArray(row.went_well),
    toImprove: parseArray(row.to_improve),
    rounds: parseRounds(row.rounds),
    tags: parseArray(row.tags),
  };
}

/** Reverse-chronological list for the journal. */
export async function listSessions(db: SQLiteDatabase): Promise<Session[]> {
  const rows = await db.getAllAsync<SessionRow>(
    'SELECT * FROM sessions ORDER BY created_at DESC'
  );
  return rows.map(mapSession);
}

export async function getSession(
  db: SQLiteDatabase,
  id: number
): Promise<Session | null> {
  const row = await db.getFirstAsync<SessionRow>(
    'SELECT * FROM sessions WHERE id = ?',
    [id]
  );
  return row ? mapSession(row) : null;
}

/** Techniques linked to a session, with the per-session notes. */
export async function getSessionTechniques(
  db: SQLiteDatabase,
  sessionId: number
): Promise<SessionTechnique[]> {
  return db.getAllAsync<SessionTechnique>(
    `SELECT t.id AS techniqueId, t.name AS name, t.category AS category,
            t.position AS position, st.notes AS notes
     FROM session_techniques st
     JOIN techniques t ON t.id = st.technique_id
     WHERE st.session_id = ?
     ORDER BY t.name COLLATE NOCASE`,
    [sessionId]
  );
}

/** Update the user-editable, self-assessment fields of a session. */
export async function updateSession(
  db: SQLiteDatabase,
  id: number,
  fields: { summary: string | null; wentWell: string[]; toImprove: string[]; tags: string[] }
): Promise<void> {
  await db.runAsync(
    `UPDATE sessions
     SET summary = ?, went_well = ?, to_improve = ?, tags = ?
     WHERE id = ?`,
    [
      fields.summary,
      JSON.stringify(fields.wentWell),
      JSON.stringify(fields.toImprove),
      JSON.stringify(fields.tags),
      id,
    ]
  );
}

export async function deleteSession(db: SQLiteDatabase, id: number): Promise<void> {
  // session_techniques rows cascade; technique library rows are intentionally kept.
  await db.runAsync('DELETE FROM sessions WHERE id = ?', [id]);
}

/**
 * Persist a structured session + its techniques in one transaction.
 * Returns the new session id. Steps:
 *   1. insert the sessions row (JSON columns stringified)
 *   2. upsert each technique (dedup by normalized name)
 *   3. insert session_techniques join rows with per-session notes
 */
export async function persistSession(
  db: SQLiteDatabase,
  args: { rawTranscript: string; structured: StructuredSession; createdAt?: string }
): Promise<number> {
  const now = args.createdAt ?? new Date().toISOString();
  const s = args.structured;

  let sessionId = 0;
  await db.withTransactionAsync(async () => {
    const res = await db.runAsync(
      `INSERT INTO sessions
         (created_at, raw_transcript, summary, went_well, to_improve, rounds, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        now,
        args.rawTranscript,
        s.summary ?? null,
        JSON.stringify(s.went_well ?? []),
        JSON.stringify(s.to_improve ?? []),
        JSON.stringify(s.rounds ?? []),
        JSON.stringify(s.tags ?? []),
      ]
    );
    sessionId = res.lastInsertRowId;

    // Dedup techniques within this single note so we never violate the join PK.
    const seen = new Map<number, string>();
    for (const tech of s.techniques ?? []) {
      if (!tech.name?.trim()) continue;
      const techniqueId = await upsertTechnique(db, {
        name: tech.name,
        category: tech.category ?? null,
        position: tech.position ?? null,
        description: tech.session_notes ?? null,
        now,
      });
      if (seen.has(techniqueId)) continue; // same technique mentioned twice in one note
      seen.set(techniqueId, tech.session_notes ?? '');
      await db.runAsync(
        'INSERT INTO session_techniques (session_id, technique_id, notes) VALUES (?, ?, ?)',
        [sessionId, techniqueId, tech.session_notes ?? null]
      );
    }
  });

  return sessionId;
}

/** Total counts for empty-state / settings display. */
export async function getCounts(
  db: SQLiteDatabase
): Promise<{ sessions: number; techniques: number }> {
  const s = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM sessions');
  const t = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM techniques');
  return { sessions: s?.n ?? 0, techniques: t?.n ?? 0 };
}

/** Wipe all data (settings "clear data"). */
export async function clearAllData(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.execAsync(
      'DELETE FROM session_techniques; DELETE FROM sessions; DELETE FROM techniques;'
    );
  });
}
