import { Ionicons } from '@expo/vector-icons';
import { Link, Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Collapsible } from '@/components/ui/collapsible';
import { useTheme } from '@/hooks/use-theme';
import { deleteSession, getSession, getSessionTechniques } from '@/db/sessions';
import type { Session, SessionTechnique } from '@/db/types';
import { safeFormat } from '@/app/(tabs)/journal';

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = Number(id);
  const theme = useTheme();
  const db = useSQLiteContext();

  const [session, setSession] = useState<Session | null>(null);
  const [techniques, setTechniques] = useState<SessionTechnique[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [s, t] = await Promise.all([
      getSession(db, sessionId),
      getSessionTechniques(db, sessionId),
    ]);
    setSession(s);
    setTechniques(t);
    setLoaded(true);
  }, [db, sessionId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const confirmDelete = () => {
    Alert.alert(
      'Delete session?',
      'This removes the session from your journal. Techniques in your library are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteSession(db, sessionId);
            router.back();
          },
        },
      ]
    );
  };

  if (!loaded) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ThemedText themeColor="textSecondary">Session not found.</ThemedText>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Session',
          headerRight: () => (
            <View style={styles.headerActions}>
              <Link href={`/session/edit/${sessionId}`} asChild>
                <Pressable hitSlop={12}>
                  <Ionicons name="create-outline" size={22} color={theme.accent} />
                </Pressable>
              </Link>
              <Pressable hitSlop={12} onPress={confirmDelete}>
                <Ionicons name="trash-outline" size={22} color={theme.danger} />
              </Pressable>
            </View>
          ),
        }}
      />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}>
        <View style={styles.heading}>
          <ThemedText type="label" themeColor="accent">
            {safeFormat(session.createdAt)}
          </ThemedText>
          {session.summary ? <ThemedText type="h1">{session.summary}</ThemedText> : null}
          {session.tags.length > 0 && (
            <View style={styles.tags}>
              {session.tags.map((t) => (
                <Chip key={t} label={t} accent />
              ))}
            </View>
          )}
        </View>

        <BulletCard title="What went well" color={theme.success} items={session.wentWell} />
        <BulletCard title="To improve" color={theme.accent} items={session.toImprove} />

        {session.rounds.length > 0 && (
          <Card>
            <ThemedText type="label" themeColor="textTertiary">
              Rounds
            </ThemedText>
            {session.rounds.map((r, i) => (
              <View key={i} style={styles.round}>
                <ThemedText style={styles.roundTitle}>
                  {[r.partner, r.outcome].filter(Boolean).join('  ·  ') || `Round ${i + 1}`}
                </ThemedText>
                {r.notes ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {r.notes}
                  </ThemedText>
                ) : null}
              </View>
            ))}
          </Card>
        )}

        {techniques.length > 0 && (
          <Card style={styles.techCard}>
            <ThemedText type="label" themeColor="textTertiary" style={styles.techHeader}>
              Techniques
            </ThemedText>
            {techniques.map((t, i) => (
              <Pressable
                key={t.techniqueId}
                onPress={() => router.push(`/technique/${t.techniqueId}`)}
                style={({ pressed }) => [
                  styles.techRow,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.background },
                  pressed && { backgroundColor: theme.backgroundSelected },
                ]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <ThemedText style={styles.techName}>{t.name}</ThemedText>
                  {t.notes ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {t.notes}
                    </ThemedText>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
              </Pressable>
            ))}
          </Card>
        )}

        <Collapsible title="Raw transcript">
          <ThemedText type="small" themeColor="textSecondary">
            {session.rawTranscript}
          </ThemedText>
        </Collapsible>
      </ScrollView>
    </>
  );
}

function BulletCard({ title, color, items }: { title: string; color: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <Card>
      <ThemedText type="label" themeColor="textTertiary">
        {title}
      </ThemedText>
      <View style={{ gap: 10 }}>
        {items.map((item, i) => (
          <View key={i} style={styles.bulletRow}>
            <View style={[styles.dot, { backgroundColor: color }]} />
            <ThemedText style={{ flex: 1 }}>{item}</ThemedText>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 56 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heading: { gap: 10, paddingHorizontal: 2, paddingTop: 4 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  bulletRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  dot: { width: 7, height: 7, borderRadius: 4, marginTop: 9 },
  round: { gap: 3, marginTop: 2 },
  roundTitle: { fontWeight: '600' },
  techCard: { paddingVertical: 6, gap: 0 },
  techHeader: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4 },
  techRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  techName: { fontSize: 16, fontWeight: '600' },
  headerActions: { flexDirection: 'row', gap: 18 },
});
