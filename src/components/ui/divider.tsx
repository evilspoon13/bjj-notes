import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/** A 1px hairline divider. `inset` left-indents it for list separators. */
export function Divider({ inset = 0 }: { inset?: number }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.divider,
        { backgroundColor: theme.border, marginLeft: inset },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  divider: { height: StyleSheet.hairlineWidth },
});
