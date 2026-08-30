import { Stack } from 'expo-router';
import '../src/polyfills';
import { useAppFonts } from '../src/theme/fonts';
import { useStorageInit, refreshRateCache, useBackgroundRateRefresh } from '../src/db/useStorage';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { colors } from '../src/theme/theme';

// Root navigator. The (tabs) group is the bottom-tab shell; trip detail and
// new-trip are pushed modally / onto the stack.
export default function RootLayout() {
  const fontsLoaded = useAppFonts();
  const { ready, error } = useStorageInit();

  // Keep the rate cache fresh whenever the app comes to the foreground, so the
  // expense form almost always has a cached rate and never blocks on the live
  // fetch (user request: prefer cached rate, fetch in the background only).
  useFocusEffect(
    useCallback(() => {
      void refreshRateCache();
    }, []),
  );

  // Background refresh ~10s after the app is usable: keeps the cached ECB rates
  // fresh without ever blocking the UI (user request).
  useBackgroundRateRefresh(10000);

  if (!fontsLoaded || !ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
        {error && <View />}
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      {/* Trip detail renders its own dark header — hide the native (white) one. */}
      <Stack.Screen name="trip/[id]" options={{ title: 'Trip', headerShown: false }} />
      <Stack.Screen
        name="trips/new"
        options={{ presentation: 'modal', title: 'New trip', headerShown: false }}
      />
      <Stack.Screen
        name="settings/exchange-rates"
        options={{ title: 'Exchange rates', headerShown: false }}
      />
    </Stack>
  );
}
