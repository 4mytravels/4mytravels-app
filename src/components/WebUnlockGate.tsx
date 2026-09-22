// Web-only passphrase unlock gate (plan Task 5, MVP scope §2.2 "PWA key
// management"). Shown before useStorageInit() on web: first visit asks to
// CREATE a passphrase, later visits ask to UNLOCK with it. The passphrase
// derives (Argon2id) the same key used for the local backup file — lost
// passphrase = lost data, which the create flow states explicitly.
//
// Native platforms never render this (Keystore-backed device key instead).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors } from '../theme/theme';

const HAS_PASSPHRASE_KEY = '4mytravels.hasPassphrase';

export interface WebUnlockGateProps {
  onUnlock: (passphrase: string) => void;
}

export function hasStoredPassphraseFlag(): boolean {
  try {
    return globalThis.localStorage?.getItem(HAS_PASSPHRASE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markPassphraseCreated(): void {
  try {
    globalThis.localStorage?.setItem(HAS_PASSPHRASE_KEY, '1');
  } catch {
    /* private mode — user will see the create flow again; salt+db still guard */
  }
}

export function WebUnlockGate({ onUnlock }: WebUnlockGateProps) {
  // Hydration safety (static export prerenders create-mode copy at build
  // time, when localStorage is empty): keep the FIRST client render identical
  // to the server HTML, then switch to unlock-mode after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isFirstUse = !mounted ? true : !hasStoredPassphraseFlag();
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = useMemo(() => {
    if (busy) return false;
    if (isFirstUse) return passphrase.length >= 8 && passphrase === confirm;
    return passphrase.length > 0;
  }, [busy, isFirstUse, passphrase, confirm]);

  // Auto-focus the input on mount (automatic UX, per user preference).
  const inputRef = React.useRef<TextInput>(null);
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, []);

  const submit = useCallback(() => {
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    // Derivation happens inside init(); the brief spinner here is an explicit
    // user action (not a form-open block), which the no-spinner rule allows.
    onUnlock(passphrase);
  }, [canSubmit, onUnlock, passphrase]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
    >
      <View style={styles.card}>
        <Text style={styles.title}>4MyTravels</Text>
        <Text style={styles.subtitle}>
          {isFirstUse
            ? 'Choose a passphrase to encrypt your data on this device.'
            : 'Enter your passphrase to unlock your data.'}
        </Text>

        {isFirstUse && (
          <Text style={styles.warning}>
            Your passphrase is never sent anywhere and cannot be recovered. If
            you lose it, your data is lost. Write it down somewhere safe.
          </Text>
        )}

        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder={isFirstUse ? 'Passphrase (min. 8 characters)' : 'Passphrase'}
          placeholderTextColor={colors.mutedForeground}
          secureTextEntry
          value={passphrase}
          onChangeText={setPassphrase}
          onSubmitEditing={isFirstUse ? undefined : submit}
          editable={!busy}
        />

        {isFirstUse && (
          <TextInput
            style={styles.input}
            placeholder="Confirm passphrase"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry
            value={confirm}
            onChangeText={setConfirm}
            onSubmitEditing={submit}
            editable={!busy}
          />
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            (!canSubmit || pressed) && styles.buttonDisabled,
          ]}
          onPress={submit}
          disabled={!canSubmit}
        >
          {busy ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.buttonText}>
              {isFirstUse ? 'Create encrypted storage' : 'Unlock'}
            </Text>
          )}
        </Pressable>

        {!isFirstUse && (
          <Text style={styles.hint}>
            Encrypted locally. No account, no cloud — your data stays in this
            browser.
          </Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    gap: 14,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: colors.mutedForeground,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  warning: {
    color: '#FBBF24',
    fontSize: 12,
    lineHeight: 17,
    backgroundColor: 'rgba(251,191,36,0.10)',
    borderRadius: 8,
    padding: 10,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    color: '#FFFFFF',
    fontSize: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  error: {
    color: '#F87171',
    fontSize: 13,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.primaryForeground,
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    color: colors.mutedForeground,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
});
