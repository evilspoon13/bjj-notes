import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

type Props = {
  children: ReactNode;
  style?: ViewStyle;
  /** When provided, the card becomes pressable with subtle feedback. */
  onPress?: () => void;
};

/**
 * A soft, filled surface — the core building block of the simplistic-modern
 * layout. No borders; separation comes from the fill + generous radius + gaps.
 */
export function Card({ children, style, onPress }: Props) {
  const theme = useTheme();

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
          style,
        ]}>
        {children}
      </Pressable>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: 18,
    gap: 10,
  },
});
