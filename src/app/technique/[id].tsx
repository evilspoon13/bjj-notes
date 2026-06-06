import { Ionicons } from '@expo/vector-icons';
import { Link, Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { useTheme } from '@/hooks/use-theme';
import { getTechnique, getTechniqueSessions } from '@/db/techniques';
import type { Technique, TechniqueSession } from '@/db/types';
import { safeFormat } from '@/app/(tabs)/journal';

export default function TechniqueDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const techniqueId = Number(id);
  const theme = useTheme();
  const db = useSQLiteContext();

  const [technique, setTechnique] = useState<Technique | null>(null);
  const [sessions, setSessions] = useState<TechniqueSession[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [t, s] = await Promise.all([
      getTechnique(db, techniqueId),
      getTechniqueSessions(db, techniqueId),
    ]);
    setTechnique(t);
    setSessions(s);
    setLoaded(true);
  }, [db, techniqueId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!loaded) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (!technique) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ThemedText themeColor="textSecondary">Technique not found.</ThemedText>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <Link href={`/technique/edit/${techniqueId}`} asChild>
              <Pressable hitSlop={12}>
                <Ionicons name="create-outline" size={22} color={theme.accent} />
              </Pressable>
            </Link>
          ),
        }}
      />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}>
        <View style={styles.heading}>
          <ThemedText type="h1">{technique.name}</ThemedText>
          <View style={styles.metaRow}>
            {technique.category ? <Chip label={technique.category} accent /> : null}
            {technique.position ? (
              <ThemedText themeColor="textSecondary">{technique.position}</ThemedText>
            ) : null}
          </View>
        </View>

        <View style={styles.statsRow}>
          <Stat value={technique.timesTrained} label="trained" highlight />
          <Stat value={safeFormat(technique.firstSeen, 'MMM d, yy')} label="first" />
          <Stat value={safeFormat(technique.lastSeen, 'MMM d, yy')} label="last" />
        </View>

        <Card>
          <ThemedText type="label" themeColor="textTertiary">
            Notes
          </ThemedText>
          {technique.description ? (
            <ThemedText style={styles.notes}>{technique.description}</ThemedText>
          ) : (
            <Pressable onPress={() => router.push(`/technique/edit/${techniqueId}`)}>
              <ThemedText themeColor="textTertiary" style={styles.notesEmpty}>
                No notes yet. Tap to add the details you couldn’t capture out loud.
              </ThemedText>
            </Pressable>
          )}
        </Card>

        <Card style={styles.sessionsCard}>
          <ThemedText type="label" themeColor="textTertiary" style={styles.sessionsHeader}>
            Appears in {sessions.length} session{sessions.length === 1 ? '' : 's'}
          </ThemedText>
          {sessions.map((s, i) => (
            <Pressable
              key={s.sessionId}
              onPress={() => router.push(`/session/${s.sessionId}`)}
              style={({ pressed }) => [
                styles.sessionRow,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.background },
                pressed && { backgroundColor: theme.backgroundSelected },
              ]}>
              <ThemedText type="label" themeColor="accent">
                {safeFormat(s.createdAt, 'MMM d, yyyy')}
              </ThemedText>
              <ThemedText numberOfLines={2}>
                {s.notes?.trim() || s.summary?.trim() || '—'}
              </ThemedText>
            </Pressable>
          ))}
        </Card>
      </ScrollView>
    </>
  );
}

function Stat({
  value,
  label,
  highlight,
}: {
  value: string | number;
  label: string;
  highlight?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: highlight ? theme.accentSoft : theme.backgroundElement }]}>
      <ThemedText style={[styles.statValue, highlight && { color: theme.accent }]}>
        {value}
      </ThemedText>
      <ThemedText type="label" themeColor={highlight ? 'accent' : 'textTertiary'}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 56 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heading: { gap: 10, paddingHorizontal: 2, paddingTop: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  statsRow: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 12, gap: 4, alignItems: 'flex-start' },
  statValue: { fontSize: 17, fontWeight: '800' },
  notes: { fontSize: 16, lineHeight: 24 },
  notesEmpty: { lineHeight: 22 },
  sessionsCard: { paddingVertical: 6, gap: 0 },
  sessionsHeader: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4 },
  sessionRow: { gap: 3, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12 },
});
