/**
 * Thin wrapper around expo-audio's recorder hooks (plan §5.1).
 *
 * Handles mic-permission state, configures the audio session for recording, and
 * exposes a simple start/stop API that resolves to the recorded `.m4a` file URI.
 */

import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useEffect, useState } from 'react';

export type PermissionState = 'undetermined' | 'granted' | 'denied';

export function useRecorder() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [permission, setPermission] = useState<PermissionState>('undetermined');

  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await AudioModule.requestRecordingPermissionsAsync();
      if (!mounted) return;
      setPermission(res.granted ? 'granted' : 'denied');
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const requestPermission = useCallback(async () => {
    const res = await AudioModule.requestRecordingPermissionsAsync();
    setPermission(res.granted ? 'granted' : 'denied');
    return res.granted;
  }, []);

  const start = useCallback(async () => {
    if (permission !== 'granted') {
      const granted = await requestPermission();
      if (!granted) return false;
    }
    await recorder.prepareToRecordAsync();
    recorder.record();
    return true;
  }, [permission, recorder, requestPermission]);

  /** Stops recording and returns the file URI of the finished `.m4a`. */
  const stop = useCallback(async (): Promise<string | null> => {
    await recorder.stop();
    return recorder.uri;
  }, [recorder]);

  return {
    isRecording: state.isRecording,
    durationMillis: state.durationMillis,
    metering: state.metering,
    permission,
    requestPermission,
    start,
    stop,
  };
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
