/**
 * Secrets + small config persisted on-device via expo-secure-store.
 *
 * The Groq API key never leaves the device and is read at call time by the AI
 * layer (plan §7). Model ids are also stored here so the user can switch models
 * from Settings without a rebuild; they fall back to the plan's defaults.
 */

import * as SecureStore from 'expo-secure-store';

const KEY_API = 'groq_api_key';
const KEY_TRANSCRIBE_MODEL = 'groq_transcribe_model';
const KEY_STRUCTURE_MODEL = 'groq_structure_model';

export const DEFAULT_TRANSCRIBE_MODEL = 'whisper-large-v3';
export const DEFAULT_STRUCTURE_MODEL = 'llama-3.3-70b-versatile';

export async function getApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_API);
}

export async function setApiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (trimmed) {
    await SecureStore.setItemAsync(KEY_API, trimmed);
  } else {
    await SecureStore.deleteItemAsync(KEY_API);
  }
}

export async function clearApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_API);
}

export async function getTranscribeModel(): Promise<string> {
  return (await SecureStore.getItemAsync(KEY_TRANSCRIBE_MODEL)) || DEFAULT_TRANSCRIBE_MODEL;
}

export async function getStructureModel(): Promise<string> {
  return (await SecureStore.getItemAsync(KEY_STRUCTURE_MODEL)) || DEFAULT_STRUCTURE_MODEL;
}

export async function setModels(transcribe: string, structure: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_TRANSCRIBE_MODEL, transcribe.trim() || DEFAULT_TRANSCRIBE_MODEL);
  await SecureStore.setItemAsync(KEY_STRUCTURE_MODEL, structure.trim() || DEFAULT_STRUCTURE_MODEL);
}
