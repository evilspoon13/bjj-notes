import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty';
import { useTheme } from '@/hooks/use-theme';
import { listTechniques, type TechniqueSort } from '@/db/techniques';
import type { Technique } from '@/db/types';

const SORTS: { key: TechniqueSort; label: string }[] = [
  { key: 'recency', label: 'Recent' },
  { key: 'frequency', label: 'Most trained' },
  { key: 'name', label: 'A–Z' },
];

export default function LibraryScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const [techniques, setTechniques] = useState<Technique[] | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<TechniqueSort>('recency');

  const load = useCallback(async () => {
    setTechniques(await listTechniques(db, { search: search.trim() || undefined, sort }));
  }, [db, search, sort]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (techniques === null) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (techniques.length === 0 && !search) {
    return (
      <View style={[styles.fill, { backgroundColor: theme.background }]}>
        <EmptyState
          icon="library-outline"
          title="No techniques yet"
          subtitle="Techniques are added automatically when you record sessions."
        />
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <View style={[styles.searchBox, { backgroundColor: theme.backgroundElement }]}>
          <Ionicons name="search" size={18} color={theme.textTertiary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search techniques"
            placeholderTextColor={theme.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.searchInput, { color: theme.text }]}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
            </Pressable>
          )}
        </View>
        <View style={styles.sortRow}>
          {SORTS.map((s) => {
            const active = s.key === sort;
            return (
              <Pressable
                key={s.key}
                onPress={() => setSort(s.key)}
                style={[
                  styles.pill,
                  { backgroundColor: active ? theme.accent : theme.backgroundElement },
                ]}>
                <ThemedText
                  type="small"
                  style={[styles.pillText, active && { color: '#fff' }]}
                  themeColor={active ? undefined : 'textSecondary'}>
                  {s.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <FlatList
        contentContainerStyle={styles.list}
        data={techniques}
        keyExtractor={(t) => String(t.id)}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          search ? (
            <ThemedText themeColor="textTertiary" style={styles.noResults}>
              No techniques match “{search}”.
            </ThemedText>
          ) : null
        }
        renderItem={({ item }) => <TechniqueRow technique={item} />}
      />
    </View>
  );
}

function TechniqueRow({ technique }: { technique: Technique }) {
  const theme = useTheme();
  return (
    <Card onPress={() => router.push(`/technique/${technique.id}`)} style={styles.row}>
      <View style={styles.rowMain}>
        <ThemedText type="h2" numberOfLines={1}>
          {technique.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textTertiary" numberOfLines={1}>
          {[technique.category, technique.position].filter(Boolean).join('  ·  ') || '—'}
        </ThemedText>
      </View>
      <View style={[styles.count, { backgroundColor: theme.accentSoft }]}>
        <ThemedText style={[styles.countNum, { color: theme.accent }]}>
          {technique.timesTrained}
        </ThemedText>
        <ThemedText type="label" themeColor="accent" style={styles.countLabel}>
          {technique.timesTrained === 1 ? 'time' : 'times'}
        </ThemedText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 12 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 46,
  },
  searchInput: { flex: 1, fontSize: 15 },
  sortRow: { flexDirection: 'row', gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  pillText: { fontSize: 13, fontWeight: '600' },
  list: { padding: 16, paddingTop: 8, gap: 12 },
  noResults: { textAlign: 'center', padding: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  rowMain: { flex: 1, gap: 4 },
  count: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  countNum: { fontSize: 24, fontWeight: '800', lineHeight: 28 },
  countLabel: { fontSize: 10 },
});
