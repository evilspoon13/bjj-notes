import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/section';
import { useTheme } from '@/hooks/use-theme';
import { DuplicateTechniqueError, getTechnique, updateTechnique } from '@/db/techniques';
import { TECHNIQUE_CATEGORIES } from '@/db/types';

export default function EditTechniqueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const techniqueId = Number(id);
  const theme = useTheme();
  const db = useSQLiteContext();

  const [name, setName] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [position, setPosition] = useState('');
  const [description, setDescription] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const t = await getTechnique(db, techniqueId);
      if (t) {
        setName(t.name);
        setCategory(t.category);
        setPosition(t.position ?? '');
        setDescription(t.description ?? '');
      }
      setLoaded(true);
    })();
  }, [db, techniqueId]);

  const save = async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Give the technique a name.');
      return;
    }
    setSaving(true);
    try {
      await updateTechnique(db, techniqueId, {
        name,
        category,
        position: position.trim() || null,
        description: description.trim() || null,
      });
      router.back();
    } catch (e) {
      const msg =
        e instanceof DuplicateTechniqueError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Could not save.';
      Alert.alert('Error', msg);
      setSaving(false);
    }
  };

  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];

  return (
    <>
      <Stack.Screen options={{ title: 'Edit technique', presentation: 'modal' }} />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        {loaded && (
          <>
            <Section title="Name">
              <TextInput value={name} onChangeText={setName} style={inputStyle} />
            </Section>

            <Section title="Category">
              <View style={styles.catWrap}>
                {TECHNIQUE_CATEGORIES.map((c) => {
                  const active = c === category;
                  return (
                    <Pressable key={c} onPress={() => setCategory(active ? null : c)}>
                      <View
                        style={[
                          styles.cat,
                          { backgroundColor: active ? theme.accent : theme.backgroundElement },
                        ]}>
                        <ThemedText
                          type="small"
                          style={[styles.catText, active && { color: '#fff' }]}
                          themeColor={active ? undefined : 'textSecondary'}>
                          {c}
                        </ThemedText>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </Section>

            <Section title="Position">
              <ThemedText type="small" themeColor="textSecondary">
                e.g. “Closed guard”, “Side control”.
              </ThemedText>
              <TextInput
                value={position}
                onChangeText={setPosition}
                placeholder="Optional"
                placeholderTextColor={theme.textTertiary}
                style={inputStyle}
              />
            </Section>

            <Section title="Notes">
              <ThemedText type="small" themeColor="textSecondary">
                Add the details you couldn’t capture in the live recording — grips,
                steps, common mistakes, reminders.
              </ThemedText>
              <TextInput
                value={description}
                onChangeText={setDescription}
                multiline
                placeholder="Describe the technique…"
                placeholderTextColor={theme.textTertiary}
                style={[inputStyle, styles.multiline]}
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
  multiline: { minHeight: 140, textAlignVertical: 'top' },
  catWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cat: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  catText: { fontWeight: '600' },
});
