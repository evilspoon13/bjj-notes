import { format, parseISO } from 'date-fns';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty';
import { useTheme } from '@/hooks/use-theme';
import { listSessions } from '@/db/sessions';
import type { Session } from '@/db/types';

export default function JournalScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setSessions(await listSessions(db));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (sessions === null) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (sessions.length === 0) {
    return (
      <View style={[styles.fill, { backgroundColor: theme.background }]}>
        <EmptyState
          icon="book-outline"
          title="No sessions yet"
          subtitle="Record a debrief on the Record tab and it will show up here."
        />
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.list}
      data={sessions}
      keyExtractor={(s) => String(s.id)}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />
      }
      renderItem={({ item }) => <SessionRow session={item} />}
    />
  );
}

function SessionRow({ session }: { session: Session }) {
  return (
    <Card onPress={() => router.push(`/session/${session.id}`)}>
      <ThemedText type="label" themeColor="accent">
        {safeFormat(session.createdAt, 'EEE, MMM d')}
      </ThemedText>
      <ThemedText type="h2" numberOfLines={2}>
        {session.summary?.trim() || session.rawTranscript}
      </ThemedText>
      {session.tags.length > 0 && (
        <View style={styles.tags}>
          {session.tags.slice(0, 4).map((t) => (
            <Chip key={t} label={t} />
          ))}
        </View>
      )}
    </Card>
  );
}

export function safeFormat(iso: string, fmt = "EEE, MMM d yyyy 'at' h:mm a"): string {
  try {
    return format(parseISO(iso), fmt);
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 12 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
});
