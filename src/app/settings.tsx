import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ExternalLink } from '@/components/external-link';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/section';
import { useTheme } from '@/hooks/use-theme';
import { clearAllData, getCounts } from '@/db/sessions';
import {
  DEFAULT_STRUCTURE_MODEL,
  DEFAULT_TRANSCRIBE_MODEL,
  getApiKey,
  getStructureModel,
  getTranscribeModel,
  setApiKey,
  setModels,
} from '@/lib/secrets';

export default function SettingsScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();

  const [apiKey, setApiKeyState] = useState('');
  const [transcribeModel, setTranscribeModel] = useState(DEFAULT_TRANSCRIBE_MODEL);
  const [structureModel, setStructureModel] = useState(DEFAULT_STRUCTURE_MODEL);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [counts, setCounts] = useState({ sessions: 0, techniques: 0 });

  const load = useCallback(async () => {
    const [key, tModel, sModel, c] = await Promise.all([
      getApiKey(),
      getTranscribeModel(),
      getStructureModel(),
      getCounts(db),
    ]);
    setApiKeyState(key ?? '');
    setTranscribeModel(tModel);
    setStructureModel(sModel);
    setCounts(c);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const save = async () => {
    setSaving(true);
    try {
      await setApiKey(apiKey);
      await setModels(transcribeModel, structureModel);
      Alert.alert('Saved', 'Your settings have been saved.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  };

  const confirmClear = () => {
    Alert.alert(
      'Clear all data?',
      `This permanently deletes ${counts.sessions} session(s) and ${counts.techniques} technique(s). This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            await clearAllData(db);
            await load();
            Alert.alert('Cleared', 'All sessions and techniques were deleted.');
          },
        },
      ]
    );
  };

  const inputStyle = [
    styles.input,
    { color: theme.text, backgroundColor: theme.backgroundElement },
  ];

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <Section title="Groq API key">
        <ThemedText type="small" themeColor="textSecondary">
          Stored only on this device (Secure Store). Never uploaded or committed.
        </ThemedText>
        <TextInput
          value={apiKey}
          onChangeText={setApiKeyState}
          placeholder="gsk_..."
          placeholderTextColor={theme.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={!showKey}
          style={inputStyle}
        />
        <View style={styles.row}>
          <ThemedText type="linkPrimary" onPress={() => setShowKey((s) => !s)}>
            {showKey ? 'Hide' : 'Show'}
          </ThemedText>
          <ExternalLink href="https://console.groq.com/keys">
            <ThemedText type="linkPrimary">Get a free key ↗</ThemedText>
          </ExternalLink>
        </View>
      </Section>

      <Section title="Models">
        <ThemedText type="small" themeColor="textSecondary">
          Transcription model
        </ThemedText>
        <TextInput
          value={transcribeModel}
          onChangeText={setTranscribeModel}
          autoCapitalize="none"
          autoCorrect={false}
          style={inputStyle}
        />
        <ThemedText type="small" themeColor="textSecondary">
          Structuring model
        </ThemedText>
        <TextInput
          value={structureModel}
          onChangeText={setStructureModel}
          autoCapitalize="none"
          autoCorrect={false}
          style={inputStyle}
        />
      </Section>

      <Button title="Save" onPress={save} loading={saving} />

      <Section title="Data">
        <ThemedText type="small" themeColor="textSecondary">
          {counts.sessions} session(s) · {counts.techniques} technique(s) on this device.
        </ThemedText>
        <Button title="Clear all data" variant="destructive" onPress={confirmClear} />
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 28, paddingBottom: 56 },
  input: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
});
