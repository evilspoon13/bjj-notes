/**
 * Database name + schema migrations.
 *
 * Migrations are versioned with SQLite's `user_version` pragma so the schema can
 * evolve without losing data. `migrateDbIfNeeded` is wired into <SQLiteProvider>
 * via its `onInit` prop in the root layout, so it runs once on app start before
 * any screen queries the DB.
 */

import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_NAME = 'bjj-notes.db';

/** Bump this and add a migration block below when the schema changes. */
const LATEST_VERSION = 1;

export async function migrateDbIfNeeded(db: SQLiteDatabase): Promise<void> {
  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = result?.user_version ?? 0;

  if (version >= LATEST_VERSION) {
    // Foreign keys must be enabled per-connection (not persisted by the pragma).
    await db.execAsync('PRAGMA foreign_keys = ON');
    return;
  }

  if (version === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS sessions (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at      TEXT NOT NULL,
        raw_transcript  TEXT NOT NULL,
        summary         TEXT,
        went_well       TEXT,
        to_improve      TEXT,
        rounds          TEXT,
        tags            TEXT
      );

      CREATE TABLE IF NOT EXISTS techniques (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT NOT NULL,
        name_norm       TEXT NOT NULL UNIQUE,
        category        TEXT,
        position        TEXT,
        description     TEXT,
        times_trained   INTEGER NOT NULL DEFAULT 0,
        first_seen      TEXT NOT NULL,
        last_seen       TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS session_techniques (
        session_id      INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        technique_id    INTEGER NOT NULL REFERENCES techniques(id) ON DELETE CASCADE,
        notes           TEXT,
        PRIMARY KEY (session_id, technique_id)
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_st_technique ON session_techniques(technique_id);
    `);
    version = 1;
  }

  // Future migrations: `if (version === 1) { ...; version = 2; }`

  await db.execAsync(`PRAGMA user_version = ${LATEST_VERSION}`);
}
