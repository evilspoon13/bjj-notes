import { type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';

/**
 * A titled content group for the minimal, type-led layout: an uppercase label
 * followed by its content, separated by whitespace rather than a boxed card.
 */
export function Section({
  title,
  children,
  style,
  gap = 10,
}: {
  title?: string;
  children: ReactNode;
  style?: ViewStyle;
  gap?: number;
}) {
  return (
    <View style={[styles.section, style]}>
      {title ? (
        <ThemedText type="label" style={styles.title}>
          {title}
        </ThemedText>
      ) : null}
      <View style={{ gap }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  title: { marginBottom: 2 },
});
