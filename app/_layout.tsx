import { Stack } from 'expo-router';
import '../src/polyfills';
import { useAppFonts } from '../src/theme/fonts';
import { useStorageInit, refreshRateCache, useBackgroundRateRefresh, resetWebStorage } from '../src/db/useStorage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { colors } from '../src/theme/theme';
import { ThemeProvider, ThemedTree, useThemeMode } from '../src/theme/ThemeProvider';
import { FloatingNav } from '../src/components/FloatingNav';
import { AppFrame } from '../src/components/AppFrame';
import { ConfirmHost } from '../src/components/ConfirmHost';
import { StatusHost } from '../src/components/StatusHost';
import { SharedImportHost } from '../src/components/SharedImportHost';
import {
  WebUnlockGate,
  hasStoredPassphraseFlag,
  markPassphraseCreated,
} from '../src/components/WebUnlockGate';
import { getStorageAdapter } from '../src/db';
import { disableBiometric } from '../src/db/web/biometric';
import { BiometricEnrollPrompt } from '../src/components/BiometricEnrollPrompt';

// PWA service worker registration (web only, static builds only). Deferred
// past first paint; skipped on localhost (Metro dev server serves different
// assets than the static export the SW precaches).
function usePwaBootstrap(ready: boolean): void {
  useEffect(() => {
    if (Platform.OS !== 'web' || !ready) return;
    if (window.location.hostname === 'localhost') return;
    const w = globalThis as unknown as {
      navigator?: { serviceWorker?: { register(u: string): Promise<unknown> } };
    };
    try {
      void w.navigator?.serviceWorker?.register('/sw.js').catch(() => undefined);
    } catch {
      /* SW unsupported — app still works, just not offline-installable */
    }
  }, [ready]);
}

// Root navigator. The (tabs) group is the bottom-tab shell; trip detail and
// new-trip are pushed modals / onto the stack.
//
// Web (PWA): storage is passphrase-encrypted (scope §2.2), so the unlock gate
// must run BEFORE useStorageInit() — the adapter derives its key from the
// passphrase. Native keeps the Keystore device key and skips the gate.
// G5: the provider sits OUTSIDE the layout body so the palette is set before
// any `colors.x` in it is read; RootInner subscribes so it re-renders on a switch.
export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootInner />
    </ThemeProvider>
  );
}

function RootInner() {
  useThemeMode();
  const fontsLoaded = useAppFonts();
  const isWeb = Platform.OS === 'web';
  const [passphrase, setPassphrase] = useState<string | null>(
    isWeb ? null : '', // native: no passphrase needed — '' means "proceed"
  );

  const [keyHex, setKeyHex] = useState<string | null>(null);

  const { ready, error, retry: retryStorage } = useStorageInit(passphrase, keyHex);
  const wrongKey = isWeb && error === 'wrong-key';

  // A rejected passphrase resets the gate for a retry.
  useEffect(() => {
    if (wrongKey) {
      resetWebStorage();
      // A stale biometric-wrapped key (db re-created / wiped) must not loop.
      if (keyHex) disableBiometric();
      setPassphrase(null);
      setKeyHex(null);
    }
  }, [wrongKey, keyHex]);

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

  // Web: request persistent storage once unlocked (scope §2.2 durability —
  // reduces eviction risk) + register the service worker on the static build.
  useEffect(() => {
    if (!isWeb || !ready) return;
    try {
      void (globalThis as unknown as {
        navigator?: { storage?: { persist?: () => Promise<boolean> } };
      }).navigator?.storage?.persist?.();
    } catch {
      /* not available */
    }
  }, [isWeb, ready]);
  usePwaBootstrap(ready);

  // Web unlock gate: until a passphrase is supplied, storage cannot init.
  if (isWeb && passphrase === null && keyHex === null) {
    return (
      <WebUnlockGate
        onUnlock={(pw) => {
          if (!hasStoredPassphraseFlag()) markPassphraseCreated();
          setPassphrase(pw);
        }}
        onUnlockKey={(hex) => setKeyHex(hex)}
      />
    );
  }

  if (!fontsLoaded || !ready) {
    // Q7: a storage failure used to leave an endless spinner (`{error && <View />}`
    // rendered nothing, and the Alert was invisible on web / before the hosts mount).
    if (error && error !== 'wrong-key') {
      return (
        <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: colors.foreground, fontFamily: 'Sora', fontSize: 20, marginBottom: 8 }}>
            Storage could not be opened
          </Text>
          <Text selectable style={{ color: colors.mutedForeground, fontSize: 14, textAlign: 'center', marginBottom: 24, maxWidth: 420 }}>
            {error}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              // Web: a clean reload re-runs the unlock + init from scratch.
              // Native: re-run the init in place.
              if (isWeb) globalThis.location?.reload();
              else retryStorage();
            }}
            style={{ backgroundColor: colors.primarySolid, borderRadius: 9999, paddingVertical: 12, paddingHorizontal: 28, minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ color: colors.primaryForeground, fontSize: 16, fontWeight: '700' }}>Retry</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primaryText} />
      </View>
    );
  }

  return (
    <ThemedTree>
      <AppFrame nav={<FloatingNav />}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          {/* Trip detail renders its own dark header — hide the native (white) one. */}
          <Stack.Screen name="trip/[id]/index" options={{ title: 'Trip', headerShown: false }} />
          {/* G1: trip edit has its own route (was /trips/new?editId=…). */}
          <Stack.Screen
            name="trip/[id]/edit"
            options={{ presentation: 'modal', title: 'Edit trip', headerShown: false }}
          />
          <Stack.Screen
            name="trips/new"
            options={{ presentation: 'modal', title: 'New trip', headerShown: false }}
          />
          <Stack.Screen
            name="settings/exchange-rates"
            options={{ title: 'Exchange rates', headerShown: false }}
          />
          <Stack.Screen name="stats" options={{ headerShown: false }} />
        </Stack>
        {/* M11: FloatingNav is passed to AppFrame (nav prop) so it stays on the
            560 px column; the Stack is centred at max-width. */}
        {/* ONE confirmation dialog for every destructive action, mounted above the
            navigator so it can never be clipped by a screen or a sheet. Web: a
            body portal at z-index 10000 (see ConfirmHost.web.tsx). */}
        <ConfirmHost />
        {/* Status messages (import/restore results, errors). Alert.alert is a
            NO-OP in react-native-web, so without this host every failure was
            invisible on the PWA — an import "just did nothing". */}
        <StatusHost />
        {/* Web share target: finishes an import that arrived through the Android
            share sheet (Delen -> 4MyTravels). Reads the file the service worker
            stashed; mounted only once storage is unlocked, because it writes to
            the encrypted database. No-op on native. */}
        <SharedImportHost />
        {/* Web: one-time offer to enable biometric unlock after (first) unlock. */}
        <BiometricEnrollPrompt />
        {/* Web notices (storage health + install nudge) render per screen, in the
            flow under the header — see src/components/WebNotices.tsx. */}
      </AppFrame>
    </ThemedTree>
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
