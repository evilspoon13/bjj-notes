import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/section';
import { useTheme } from '@/hooks/use-theme';
import { getSession, updateSession } from '@/db/sessions';

/** Split a multiline textarea into trimmed, non-empty lines. */
function toLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

export default function EditSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = Number(id);
  const theme = useTheme();
  const db = useSQLiteContext();

  const [summary, setSummary] = useState('');
  const [wentWell, setWentWell] = useState('');
  const [toImprove, setToImprove] = useState('');
  const [tags, setTags] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await getSession(db, sessionId);
      if (s) {
        setSummary(s.summary ?? '');
        setWentWell(s.wentWell.join('\n'));
        setToImprove(s.toImprove.join('\n'));
        setTags(s.tags.join(', '));
      }
      setLoaded(true);
    })();
  }, [db, sessionId]);

  const save = async () => {
    setSaving(true);
    try {
      await updateSession(db, sessionId, {
        summary: summary.trim() || null,
        wentWell: toLines(wentWell),
        toImprove: toLines(toImprove),
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      });
      router.back();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save.');
      setSaving(false);
    }
  };

  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];

  return (
    <>
      <Stack.Screen options={{ title: 'Edit session', presentation: 'modal' }} />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        {loaded && (
          <>
            <Section title="Summary">
              <TextInput
                value={summary}
                onChangeText={setSummary}
                multiline
                style={[inputStyle, styles.multiline]}
              />
            </Section>
            <Section title="What went well">
              <ThemedText type="small" themeColor="textSecondary">
                One item per line.
              </ThemedText>
              <TextInput
                value={wentWell}
                onChangeText={setWentWell}
                multiline
                style={[inputStyle, styles.multiline]}
              />
            </Section>
            <Section title="To improve">
              <ThemedText type="small" themeColor="textSecondary">
                One item per line.
              </ThemedText>
              <TextInput
                value={toImprove}
                onChangeText={setToImprove}
                multiline
                style={[inputStyle, styles.multiline]}
              />
            </Section>
            <Section title="Tags">
              <ThemedText type="small" themeColor="textSecondary">
                Comma-separated.
              </ThemedText>
              <TextInput
                value={tags}
                onChangeText={setTags}
                autoCapitalize="none"
                style={inputStyle}
              />
            </Section>
            <Button title="Save changes" onPress={save} loading={saving} />
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 24, paddingBottom: 56 },
  input: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
});
