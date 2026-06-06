/**
 * Orchestrates the record→transcribe→structure→persist pipeline (plan §5, §6).
 *
 * Kept separate from the Record screen so the screen only deals with UI state.
 * Each stage reports progress via the `onStage` callback. Structuring is retried
 * once on failure before giving up, and the raw transcript is always returned to
 * the caller even if structuring/persistence fail so nothing is lost.
 */

import type { SQLiteDatabase } from 'expo-sqlite';

import { GroqError, structure, transcribe } from './groq';
import { persistSession } from '@/db/sessions';
import { listTechniqueNames } from '@/db/techniques';
import {
  getApiKey,
  getStructureModel,
  getTranscribeModel,
} from '@/lib/secrets';

export type PipelineStage =
  | 'transcribing'
  | 'organizing'
  | 'saving'
  | 'done'
  | 'error';

export class MissingApiKeyError extends Error {
  constructor() {
    super('No Groq API key set. Add one in Settings.');
    this.name = 'MissingApiKeyError';
  }
}

export type PipelineResult = {
  sessionId: number;
  transcript: string;
};

export async function runPipeline(
  db: SQLiteDatabase,
  audioUri: string,
  onStage: (stage: PipelineStage) => void
): Promise<PipelineResult> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new MissingApiKeyError();

  const [transcribeModel, structureModel] = await Promise.all([
    getTranscribeModel(),
    getStructureModel(),
  ]);

  onStage('transcribing');
  const transcript = await transcribe(audioUri, { apiKey, model: transcribeModel });
  if (!transcript) {
    throw new GroqError('Transcription came back empty — try recording again.');
  }

  onStage('organizing');
  const existingNames = await listTechniqueNames(db);
  let structured;
  try {
    structured = await structure(transcript, existingNames, { apiKey, model: structureModel });
  } catch (firstErr) {
    // Retry structuring once before surfacing the failure (plan §6).
    try {
      structured = await structure(transcript, existingNames, {
        apiKey,
        model: structureModel,
      });
    } catch {
      throw new TranscriptPreservedError(transcript, firstErr);
    }
  }

  onStage('saving');
  const sessionId = await persistSession(db, { rawTranscript: transcript, structured });

  onStage('done');
  return { sessionId, transcript };
}

/**
 * Thrown when transcription succeeded but structuring/persistence failed.
 * Carries the transcript so the UI can show it and avoid losing the recording.
 */
export class TranscriptPreservedError extends Error {
  constructor(
    readonly transcript: string,
    readonly cause: unknown
  ) {
    super(cause instanceof Error ? cause.message : 'Failed to organize the transcript.');
    this.name = 'TranscriptPreservedError';
  }
}
