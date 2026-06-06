import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

/** A soft filled tag. `accent` tints it with the warm accent wash. */
export function Chip({ label, accent = false }: { label: string; accent?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: accent ? theme.accentSoft : theme.backgroundSelected },
      ]}>
      <ThemedText type="small" style={styles.text} themeColor={accent ? 'accent' : 'textSecondary'}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
  },
  text: { fontSize: 13, fontWeight: '600' },
});
