import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useTheme } from '@/hooks/use-theme';
import {
  MissingApiKeyError,
  PipelineStage,
  runPipeline,
  TranscriptPreservedError,
} from '@/ai/pipeline';
import { formatDuration, useRecorder } from '@/audio/useRecorder';

type UiState =
  | { kind: 'idle' }
  | { kind: 'recording' }
  | { kind: 'processing'; stage: PipelineStage; transcript?: string }
  | { kind: 'error'; message: string; transcript?: string };

const STAGE_LABEL: Record<PipelineStage, string> = {
  transcribing: 'Transcribing',
  organizing: 'Organizing',
  saving: 'Saving',
  done: 'Saved',
  error: 'Error',
};

export default function RecordScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const rec = useRecorder();
  const [ui, setUi] = useState<UiState>({ kind: 'idle' });

  const onMicPress = async () => {
    if (rec.isRecording) {
      const uri = await rec.stop();
      if (!uri) {
        setUi({ kind: 'error', message: 'Recording failed — no audio captured.' });
        return;
      }
      await process(uri);
    } else {
      const started = await rec.start();
      if (!started) {
        setUi({
          kind: 'error',
          message: 'Microphone permission is required. Enable it in iOS Settings.',
        });
        return;
      }
      setUi({ kind: 'recording' });
    }
  };

  const process = async (uri: string) => {
    setUi({ kind: 'processing', stage: 'transcribing' });
    try {
      const result = await runPipeline(db, uri, (stage) =>
        setUi((prev) => ({
          kind: 'processing',
          stage,
          transcript: prev.kind === 'processing' ? prev.transcript : undefined,
        }))
      );
      setUi({ kind: 'idle' });
      router.push(`/session/${result.sessionId}`);
    } catch (e) {
      if (e instanceof MissingApiKeyError) {
        setUi({ kind: 'error', message: e.message });
      } else if (e instanceof TranscriptPreservedError) {
        setUi({
          kind: 'error',
          message: `Couldn't organize the session: ${e.message}\n\nYour transcript is saved below — you can try again.`,
          transcript: e.transcript,
        });
      } else {
        setUi({
          kind: 'error',
          message: e instanceof Error ? e.message : 'Something went wrong.',
        });
      }
    }
  };

  const processing = ui.kind === 'processing';
  const recording = rec.isRecording;

  const statusText = recording
    ? formatDuration(rec.durationMillis)
    : processing
      ? `${STAGE_LABEL[ui.stage]}…`
      : ui.kind === 'error'
        ? 'Try again'
        : 'Ready';

  const hintText = recording
    ? 'Tap to stop and process'
    : ui.kind === 'idle'
      ? 'Record a spoken recap after training'
      : '';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.micWrap}>
            {recording && <View style={[styles.ring, { borderColor: theme.danger }]} />}
            <Pressable
              onPress={onMicPress}
              disabled={processing}
              style={({ pressed }) => [
                styles.micButton,
                {
                  backgroundColor: recording ? theme.danger : theme.accent,
                  opacity: processing ? 0.55 : pressed ? 0.85 : 1,
                },
              ]}>
              {processing ? (
                <ActivityIndicator color="#fff" size="large" />
              ) : (
                <Ionicons name={recording ? 'stop' : 'mic'} size={56} color="#fff" />
              )}
            </Pressable>
          </View>

          <ThemedText type="h1" style={styles.statusText}>
            {statusText}
          </ThemedText>
          {hintText ? (
            <ThemedText themeColor="textSecondary" style={styles.hint}>
              {hintText}
            </ThemedText>
          ) : null}
        </View>

        {ui.kind === 'processing' && <PipelineSteps stage={ui.stage} />}

        {ui.kind === 'error' && (
          <Card style={styles.errorCard}>
            <View style={styles.errorHead}>
              <Ionicons name="alert-circle" size={18} color={theme.danger} />
              <ThemedText style={{ color: theme.danger, flex: 1 }}>{ui.message}</ThemedText>
            </View>
            {ui.message.includes('API key') && (
              <Button
                title="Open Settings"
                variant="secondary"
                onPress={() => router.push('/settings')}
              />
            )}
            {ui.transcript ? (
              <>
                <ThemedText type="label" themeColor="textTertiary">
                  Transcript
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {ui.transcript}
                </ThemedText>
              </>
            ) : null}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function PipelineSteps({ stage }: { stage: PipelineStage }) {
  const theme = useTheme();
  const order: PipelineStage[] = ['transcribing', 'organizing', 'saving', 'done'];
  const currentIdx = order.indexOf(stage);
  return (
    <View style={styles.steps}>
      {(['transcribing', 'organizing', 'saving'] as PipelineStage[]).map((s) => {
        const idx = order.indexOf(s);
        const isDone = currentIdx > idx || stage === 'done';
        const isActive = currentIdx === idx && stage !== 'done';
        return (
          <View key={s} style={styles.stepRow}>
            {isActive ? (
              <ActivityIndicator size="small" color={theme.accent} />
            ) : (
              <Ionicons
                name={isDone ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={isDone ? theme.success : theme.textTertiary}
              />
            )}
            <ThemedText themeColor={isActive || isDone ? 'text' : 'textTertiary'}>
              {STAGE_LABEL[s]}
            </ThemedText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 20, gap: 28, flexGrow: 1 },
  hero: { alignItems: 'center', justifyContent: 'center', gap: 14, paddingTop: 56 },
  micWrap: { alignItems: 'center', justifyContent: 'center', width: 180, height: 180 },
  ring: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 2,
    opacity: 0.4,
  },
  micButton: {
    width: 148,
    height: 148,
    borderRadius: 74,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: { marginTop: 8 },
  hint: { textAlign: 'center' },
  steps: { gap: 16, paddingHorizontal: 8 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  errorCard: { gap: 12 },
  errorHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
});
