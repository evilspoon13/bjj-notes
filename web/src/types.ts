/** Mirrors the Pydantic models in `server/app/models.py`. */

export type Round = {
  partner: string | null;
  outcome: string | null;
  notes: string;
};

export type SessionTechnique = {
  technique_id: number;
  name: string;
  category: string | null;
  position: string | null;
  notes: string | null;
};

/**
 * An ordered chain of grips and movements. Unlike techniques, sequences are
 * per-session and never merged — the same entry described twice is two records.
 */
export type Sequence = {
  id: number;
  session_id: number;
  session_title: string;
  created_at: string;
  name: string;
  steps: string[];
  position: string | null;
  technique_id: number | null;
  technique_name: string | null;
  notes: string | null;
};

export type SessionListItem = {
  id: number;
  created_at: string;
  title: string;
  summary: string | null;
  tags: string[];
};

export type Session = {
  id: number;
  created_at: string;
  raw_transcript: string;
  title: string;
  summary: string | null;
  went_well: string[];
  to_improve: string[];
  rounds: Round[];
  tags: string[];
  techniques: SessionTechnique[];
  sequences: Sequence[];
};

/** POST responses add the transient pipeline status. */
export type CreatedSession = Session & {
  structuring_failed: boolean;
  error: string | null;
};

export type SessionUpdate = {
  title: string | null;
  summary: string | null;
  went_well: string[];
  to_improve: string[];
  tags: string[];
};

/**
 * A move in the library. `steps` / `key_details` / `tips` describe how to do the
 * move itself; how it chains with other moves lives in `Sequence`.
 */
export type Technique = {
  id: number;
  name: string;
  category: string | null;
  position: string | null;
  description: string | null;
  steps: string[];
  key_details: string[];
  tips: string[];
  times_trained: number;
  first_seen: string;
  last_seen: string;
};

export type CreatedTechnique = {
  technique: TechniqueDetail;
  /** False when the name already existed and only empty fields were filled. */
  created: boolean;
};

export type TechniqueSession = {
  session_id: number;
  created_at: string;
  title: string;
  notes: string | null;
};

export type TechniqueDetail = Technique & {
  sessions: TechniqueSession[];
  /** The ways you've arrived at this technique. */
  sequences: Sequence[];
};

export type TechniqueUpdate = {
  name: string;
  category: string | null;
  position: string | null;
  description: string | null;
  steps: string[];
  key_details: string[];
  tips: string[];
};

export type TechniqueSort = 'recency' | 'frequency' | 'name';
