/**
 * Technique library queries + the dedup upsert.
 *
 * Dedup key is `name_norm` (lowercased/trimmed/whitespace-collapsed). The LLM is
 * already asked to reuse canonical names (plan §5.3), and this normalization is
 * the safety net that catches casing/spacing variants of the same name.
 */

import type { SQLiteDatabase } from 'expo-sqlite';

import type { Technique, TechniqueRow, TechniqueSession } from './types';

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function mapTechnique(row: TechniqueRow): Technique {
  return {
    id: row.id,
    name: row.name,
    nameNorm: row.name_norm,
    category: row.category,
    position: row.position,
    description: row.description,
    timesTrained: row.times_trained,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
  };
}

export type TechniqueSort = 'recency' | 'frequency' | 'name';

export async function listTechniques(
  db: SQLiteDatabase,
  opts: { search?: string; sort?: TechniqueSort } = {}
): Promise<Technique[]> {
  const { search, sort = 'recency' } = opts;
  const orderBy =
    sort === 'frequency'
      ? 'times_trained DESC, last_seen DESC'
      : sort === 'name'
        ? 'name COLLATE NOCASE ASC'
        : 'last_seen DESC';

  const where = search ? 'WHERE name_norm LIKE ?' : '';
  const params = search ? [`%${normalizeName(search)}%`] : [];

  const rows = await db.getAllAsync<TechniqueRow>(
    `SELECT * FROM techniques ${where} ORDER BY ${orderBy}`,
    params
  );
  return rows.map(mapTechnique);
}

export async function getTechnique(
  db: SQLiteDatabase,
  id: number
): Promise<Technique | null> {
  const row = await db.getFirstAsync<TechniqueRow>(
    'SELECT * FROM techniques WHERE id = ?',
    [id]
  );
  return row ? mapTechnique(row) : null;
}

export async function listTechniqueNames(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>(
    'SELECT name FROM techniques ORDER BY name COLLATE NOCASE'
  );
  return rows.map((r) => r.name);
}

/** Sessions in which a technique appeared, newest first. */
export async function getTechniqueSessions(
  db: SQLiteDatabase,
  techniqueId: number
): Promise<TechniqueSession[]> {
  return db.getAllAsync<TechniqueSession>(
    `SELECT s.id AS sessionId, s.created_at AS createdAt, s.summary AS summary, st.notes AS notes
     FROM session_techniques st
     JOIN sessions s ON s.id = st.session_id
     WHERE st.technique_id = ?
     ORDER BY s.created_at DESC`,
    [techniqueId]
  );
}

export class DuplicateTechniqueError extends Error {
  constructor(name: string) {
    super(`Another technique is already named “${name}”.`);
    this.name = 'DuplicateTechniqueError';
  }
}

/**
 * Update a technique's user-editable fields. When the name changes, `name_norm`
 * is recomputed; if that collides with a different technique, the UNIQUE
 * constraint throws and we surface a friendly DuplicateTechniqueError.
 */
export async function updateTechnique(
  db: SQLiteDatabase,
  id: number,
  fields: {
    name: string;
    category: string | null;
    position: string | null;
    description: string | null;
  }
): Promise<void> {
  const name = fields.name.trim();
  const nameNorm = normalizeName(name);
  try {
    await db.runAsync(
      `UPDATE techniques
       SET name = ?, name_norm = ?, category = ?, position = ?, description = ?
       WHERE id = ?`,
      [name, nameNorm, fields.category, fields.position, fields.description, id]
    );
  } catch (e) {
    if (e instanceof Error && /unique/i.test(e.message)) {
      throw new DuplicateTechniqueError(name);
    }
    throw e;
  }
}

/**
 * Insert or update a technique by normalized name and return its id.
 *
 * - New technique: inserted with `times_trained = 1`, `first_seen = last_seen = now`.
 * - Existing technique: `times_trained += 1`, `last_seen = now`, and any
 *   previously-empty category/position/description is backfilled.
 *
 * Must be called inside a transaction by the caller (see persistSession).
 */
export async function upsertTechnique(
  db: SQLiteDatabase,
  input: {
    name: string;
    category: string | null;
    position: string | null;
    description: string | null;
    now: string;
  }
): Promise<number> {
  const nameNorm = normalizeName(input.name);
  const existing = await db.getFirstAsync<TechniqueRow>(
    'SELECT * FROM techniques WHERE name_norm = ?',
    [nameNorm]
  );

  if (existing) {
    await db.runAsync(
      `UPDATE techniques
       SET times_trained = times_trained + 1,
           last_seen = ?,
           category = COALESCE(category, ?),
           position = COALESCE(position, ?),
           description = COALESCE(description, ?)
       WHERE id = ?`,
      [input.now, input.category, input.position, input.description, existing.id]
    );
    return existing.id;
  }

  const res = await db.runAsync(
    `INSERT INTO techniques
       (name, name_norm, category, position, description, times_trained, first_seen, last_seen)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      input.name.trim(),
      nameNorm,
      input.category,
      input.position,
      input.description,
      input.now,
      input.now,
    ]
  );
  return res.lastInsertRowId;
}
