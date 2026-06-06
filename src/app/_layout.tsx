import { DarkTheme, DefaultTheme, type Theme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider } from 'expo-sqlite';
import { Suspense, useMemo } from 'react';
import { ActivityIndicator, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Colors } from '@/constants/theme';
import { DATABASE_NAME, migrateDbIfNeeded } from '@/db/schema';

function navTheme(scheme: 'light' | 'dark'): Theme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const c = Colors[scheme];
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: c.accent,
      background: c.background,
      card: c.background,
      text: c.text,
      border: c.border,
      notification: c.accent,
    },
  };
}

export default function RootLayout() {
  const colorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = useMemo(() => navTheme(colorScheme), [colorScheme]);
  const c = Colors[colorScheme];

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Suspense
        fallback={
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.background,
            }}>
            <ActivityIndicator size="large" color={c.accent} />
          </View>
        }>
        <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded} useSuspense>
          <ThemeProvider value={theme}>
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: c.background },
                headerShadowVisible: false,
                headerTitleStyle: { fontWeight: '800', fontSize: 18 },
                headerTintColor: c.accent,
                headerBackButtonDisplayMode: 'minimal',
                contentStyle: { backgroundColor: c.background },
              }}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="settings" options={{ title: 'Settings', presentation: 'modal' }} />
              <Stack.Screen name="session/[id]" options={{ title: 'Session' }} />
              <Stack.Screen
                name="session/edit/[id]"
                options={{ title: 'Edit session', presentation: 'modal' }}
              />
              <Stack.Screen name="technique/[id]" options={{ title: 'Technique' }} />
              <Stack.Screen
                name="technique/edit/[id]"
                options={{ title: 'Edit technique', presentation: 'modal' }}
              />
            </Stack>
            <StatusBar style="auto" />
          </ThemeProvider>
        </SQLiteProvider>
      </Suspense>
    </GestureHandlerRootView>
  );
}
