/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

/**
 * Simplistic-modern palette: warm orange accent on cool zinc neutrals.
 * Hierarchy comes from soft filled surfaces (`backgroundElement`) and type, not
 * borders. `accent` carries energy on key elements (mic, counts, active state,
 * links, tags). Dark mode uses a near-black zinc base with a brighter orange.
 */
export const Colors = {
  light: {
    text: '#18181B', // zinc-900
    textSecondary: '#52525B', // zinc-600
    textTertiary: '#A1A1AA', // zinc-400 — faint meta
    background: '#FFFFFF',
    backgroundElement: '#F4F4F5', // zinc-100 — soft filled card / input
    backgroundSelected: '#E4E4E7', // zinc-200 — pressed / selected
    border: '#E4E4E7',
    accent: '#F97316', // orange-500
    accentSoft: '#FFF1E8', // warm wash behind accent text
    danger: '#EF4444',
    success: '#22C55E',
  },
  dark: {
    text: '#FAFAFA',
    textSecondary: '#A1A1AA', // zinc-400
    textTertiary: '#71717A', // zinc-500
    background: '#09090B', // zinc-950
    backgroundElement: '#18181B', // zinc-900 — soft filled card / input
    backgroundSelected: '#27272A', // zinc-800
    border: '#27272A',
    accent: '#FB923C', // orange-400 — brighter on dark
    accentSoft: '#2A1A0E',
    danger: '#F87171',
    success: '#4ADE80',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
