// Root providers: React Query, gestures, safe areas, the dark theme, and the
// SQLite database (opened and migrated before anything reads it).
import '../../global.css';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getDatabase } from '../db/sqliteClient';
import { colors } from '../theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, refetchOnReconnect: true, staleTime: 30000 }
  }
});

// React Query's "window focus" is the app coming to the foreground.
focusManager.setEventListener((setFocused) => {
  const sub = AppState.addEventListener('change', (s) => setFocused(s === 'active'));
  return () => sub.remove();
});

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.night950, card: colors.night950, border: colors.night800, primary: colors.cyan, text: colors.night100 }
};

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    getDatabase()
      .then(() => setDbReady(true))
      .catch((err: unknown) => setDbError(err instanceof Error ? err.message : 'Could not open the database'));
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.night950 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider value={theme}>
            <StatusBar style="light" />
            {dbError ? (
              <View className="flex-1 items-center justify-center bg-night-950 px-8">
                <Text className="text-center text-[15px] text-night-100">Night Owl couldn't open its storage: {dbError}</Text>
              </View>
            ) : dbReady ? (
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.night950 } }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="onboarding" options={{ presentation: 'modal', gestureEnabled: true }} />
              </Stack>
            ) : (
              <View className="flex-1 bg-night-950" />
            )}
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
