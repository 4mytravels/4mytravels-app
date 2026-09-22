import { Stack } from 'expo-router';
import '../src/polyfills';
import { useAppFonts } from '../src/theme/fonts';
import { useStorageInit, refreshRateCache, useBackgroundRateRefresh, resetWebStorage } from '../src/db/useStorage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { colors } from '../src/theme/theme';
import { FloatingNav } from '../src/components/FloatingNav';
import {
  WebUnlockGate,
  hasStoredPassphraseFlag,
  markPassphraseCreated,
} from '../src/components/WebUnlockGate';
import { StorageHealthBanner } from '../src/components/StorageHealthBanner';
import { getStorageAdapter } from '../src/db';

// Root navigator. The (tabs) group is the bottom-tab shell; trip detail and
// new-trip are pushed modals / onto the stack.
//
// Web (PWA): storage is passphrase-encrypted (scope §2.2), so the unlock gate
// must run BEFORE useStorageInit() — the adapter derives its key from the
// passphrase. Native keeps the Keystore device key and skips the gate.
export default function RootLayout() {
  const fontsLoaded = useAppFonts();
  const isWeb = Platform.OS === 'web';
  const [passphrase, setPassphrase] = useState<string | null>(
    isWeb ? null : '', // native: no passphrase needed — '' means "proceed"
  );

  const { ready, error } = useStorageInit(passphrase);
  const wrongKey = isWeb && error === 'wrong-key';

  // A rejected passphrase resets the gate for a retry.
  useEffect(() => {
    if (wrongKey) {
      resetWebStorage();
      setPassphrase(null);
    }
  }, [wrongKey]);

  // Keep the rate cache fresh whenever the app comes to the foreground, so the
  // expense form almost always has a cached rate and never blocks on the live
  // fetch (user request: prefer cached rate, fetch in the background only).
  useFocusEffect(
    useCallback(() => {
      void refreshRateCache();
    }, []),
  );

  // Background refresh ~10s after the app is usable: keeps the cached ECB rates
  // fresh without ever blocking the UI (user request). Pass the single `ready`
  // flag so we never re-init the native adapter (would crash → reload loop).
  useBackgroundRateRefresh(ready, 10000);

  // Web unlock gate: until a passphrase is supplied, storage cannot init.
  if (isWeb && passphrase === null) {
    return (
      <WebUnlockGate
        onUnlock={(pw) => {
          if (!hasStoredPassphraseFlag()) markPassphraseCreated();
          setPassphrase(pw);
        }}
      />
    );
  }

  if (!fontsLoaded || !ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
        {error && <View />}
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
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
      {isWeb && <StorageHealthBanner />}
      <FloatingNav />
    </View>
  );
}

// Expose the web storage health (vfs mode) for the StorageHealthBanner without
// an import cycle. No-op on native (adapter has no `vfs` property).
if (Platform.OS === 'web') {
  (globalThis as unknown as {
    __fourmytravels_storage_health?: () => { vfs: string } | null;
  }).__fourmytravels_storage_health = () => {
    try {
      const a = getStorageAdapter() as unknown as { vfs?: string };
      return a && typeof a.vfs === 'string' ? { vfs: a.vfs } : null;
    } catch {
      return null;
    }
  };
}
