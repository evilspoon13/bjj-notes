/**
 * Domain types for the BJJ training journal.
 *
 * In SQLite the JSON-array columns (`went_well`, `to_improve`, `rounds`, `tags`)
 * are stored as TEXT. The `*Row` types mirror the raw table shape; the parsed
 * types (`Session`, `Technique`) are what the app works with after decoding.
 */

export const TECHNIQUE_CATEGORIES = [
  'Guard',
  'Passing',
  'Submission',
  'Takedown',
  'Escape',
  'Sweep',
  'Other',
] as const;

export type TechniqueCategory = (typeof TECHNIQUE_CATEGORIES)[number];

export type Round = {
  partner: string | null;
  outcome: string | null;
  notes: string;
};

/** Raw `sessions` row as stored in SQLite. */
export type SessionRow = {
  id: number;
  created_at: string;
  raw_transcript: string;
  summary: string | null;
  went_well: string | null;
  to_improve: string | null;
  rounds: string | null;
  tags: string | null;
};

/** Parsed session with JSON columns decoded. */
export type Session = {
  id: number;
  createdAt: string;
  rawTranscript: string;
  summary: string | null;
  wentWell: string[];
  toImprove: string[];
  rounds: Round[];
  tags: string[];
};

export type TechniqueRow = {
  id: number;
  name: string;
  name_norm: string;
  category: string | null;
  position: string | null;
  description: string | null;
  times_trained: number;
  first_seen: string;
  last_seen: string;
};

export type Technique = {
  id: number;
  name: string;
  nameNorm: string;
  category: string | null;
  position: string | null;
  description: string | null;
  timesTrained: number;
  firstSeen: string;
  lastSeen: string;
};

/** A technique as it appears inside a single session (join row + name). */
export type SessionTechnique = {
  techniqueId: number;
  name: string;
  category: string | null;
  position: string | null;
  notes: string | null;
};

/** A session in which a given technique appeared (for the technique detail screen). */
export type TechniqueSession = {
  sessionId: number;
  createdAt: string;
  summary: string | null;
  notes: string | null;
};

/**
 * The shape the LLM returns (see plan §5.4). This is what `structure()` parses
 * out of the model response and what the persistence layer consumes.
 */
export type StructuredSession = {
  summary: string;
  went_well: string[];
  to_improve: string[];
  tags: string[];
  rounds: Round[];
  techniques: {
    name: string;
    category: TechniqueCategory | string;
    position: string | null;
    session_notes: string;
  }[];
};
