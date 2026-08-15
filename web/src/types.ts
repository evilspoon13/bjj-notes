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

export type Technique = {
  id: number;
  name: string;
  category: string | null;
  position: string | null;
  description: string | null;
  times_trained: number;
  first_seen: string;
  last_seen: string;
};

export type TechniqueSession = {
  session_id: number;
  created_at: string;
  title: string;
  notes: string | null;
};

export type TechniqueDetail = Technique & {
  sessions: TechniqueSession[];
};

export type TechniqueUpdate = {
  name: string;
  category: string | null;
  position: string | null;
  description: string | null;
};

export type TechniqueSort = 'recency' | 'frequency' | 'name';
