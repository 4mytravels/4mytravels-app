// Web-only passphrase unlock gate (plan Task 5, MVP scope §2.2 "PWA key
// management"). Shown before useStorageInit() on web: first visit asks to
// CREATE a passphrase, later visits ask to UNLOCK with it. The passphrase
// derives (Argon2id) the same key used for the local backup file — lost
// passphrase = lost data, which the create flow states explicitly.
//
// Native platforms never render this (Keystore-backed device key instead).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { generatePassphrase } from '../db/web/passphrase';
import { isBiometricEnrolled, unlockWithBiometric } from '../db/web/biometric';

const HAS_PASSPHRASE_KEY = '4mytravels.hasPassphrase';

export interface WebUnlockGateProps {
  onUnlock: (passphrase: string) => void;
  /** Biometric unlock hands over the already-derived database key. */
  onUnlockKey?: (keyHex: string) => void;
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

// Raw DOM <form> with a username + new-password field: this is what makes
// Proton Pass / Bitwarden / Google Passwords offer to SAVE the generated
// passphrase on submit. react-native-web renders on react-dom, so plain DOM
// elements are fine on web (this component is web-only).
function PasswordManagerForm(props: {
  passphrase: string;
  reveal: boolean;
  onSubmit: () => void;
  disabled: boolean;
  label: string;
}) {
  const h = React.createElement;
  return h(
    'form',
    {
      onSubmit: (e: { preventDefault(): void }) => {
        e.preventDefault();
        props.onSubmit();
      },
      style: { display: 'flex', flexDirection: 'column', gap: 14 },
    },
    h('input', {
      type: 'text', name: 'username', autoComplete: 'username', value: '4MyTravels',
      readOnly: true, tabIndex: -1, 'aria-hidden': true,
      style: { position: 'absolute', opacity: 0, height: 0, width: 0, pointerEvents: 'none' },
    }),
    h('input', {
      type: props.reveal ? 'text' : 'password', name: 'password', autoComplete: 'new-password',
      value: props.passphrase, readOnly: true, 'aria-label': 'Generated passphrase',
      style: {
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10, color: '#FFFFFF', fontSize: 16, padding: '12px 14px',
        fontFamily: 'ui-monospace, monospace', width: '100%', boxSizing: 'border-box',
      },
    }),
    h('button', {
      type: 'submit', disabled: props.disabled,
      style: {
        background: colors.primary, color: colors.primaryForeground, border: 'none',
        borderRadius: 12, padding: '14px 0', fontSize: 16, fontWeight: 600,
        opacity: props.disabled ? 0.5 : 1, cursor: props.disabled ? 'default' : 'pointer',
      },
    }, props.label),
  );
}

export function WebUnlockGate({ onUnlock, onUnlockKey }: WebUnlockGateProps) {
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

  // Create flow: generated passphrase by default, own passphrase optional.
  // Generated client-side only (after mount) so SSR HTML stays deterministic.
  const [generated, setGenerated] = useState('');
  const [ownMode, setOwnMode] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (mounted && isFirstUse && !generated) setGenerated(generatePassphrase());
  }, [mounted, isFirstUse, generated]);

  // Unlock flow: biometric first when enrolled.
  const [bioEnrolled, setBioEnrolled] = useState(false);
  const bioTried = useRef(false);
  const tryBiometric = useCallback(async () => {
    setError(null);
    const key = await unlockWithBiometric();
    if (key && onUnlockKey) {
      setBusy(true);
      onUnlockKey(key);
    } else {
      setError('Biometric unlock failed or was cancelled — use your passphrase.');
    }
  }, [onUnlockKey]);
  useEffect(() => {
    if (!mounted || isFirstUse) return;
    const enrolled = isBiometricEnrolled();
    setBioEnrolled(enrolled);
    if (enrolled && !bioTried.current) {
      bioTried.current = true;
      void tryBiometric();
    }
  }, [mounted, isFirstUse, tryBiometric]);

  const canSubmit = useMemo(() => {
    if (busy) return false;
    if (isFirstUse && !ownMode) return generated.length > 0 && saved;
    if (isFirstUse) return passphrase.length >= 8 && passphrase === confirm;
    return passphrase.length > 0;
  }, [busy, isFirstUse, ownMode, generated, saved, passphrase, confirm]);

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
    onUnlock(isFirstUse && !ownMode ? generated : passphrase);
  }, [canSubmit, onUnlock, isFirstUse, ownMode, generated, passphrase]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(generated);
      setSaved(true);
      setNotice('Copied. Clear your clipboard after pasting it into your password manager.');
    } catch {
      setNotice('Copy failed — select and copy it manually, or download the file.');
    }
  }, [generated]);

  const download = useCallback(() => {
    const text =
      '4MyTravels recovery passphrase\n\n' + generated +
      '\n\nKeep this file somewhere safe and private. Without it your data cannot be recovered.\n';
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = '4mytravels-recovery-passphrase.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSaved(true);
    setNotice('Downloaded. Store the file in your password manager or an encrypted vault.');
  }, [generated]);

  const createMode = isFirstUse && !ownMode;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
    >
      <View style={styles.card}>
        <Text style={styles.title}>4MyTravels</Text>
        <Text style={styles.subtitle}>
          {isFirstUse
            ? createMode
              ? 'We generated a passphrase that encrypts your data on this device.'
              : 'Choose a passphrase to encrypt your data on this device.'
            : 'Enter your passphrase to unlock your data.'}
        </Text>

        {isFirstUse && (
          <Text style={styles.warning}>
            Your passphrase is never sent anywhere and cannot be recovered. If
            you lose it, your data is lost. Save it in your password manager.
          </Text>
        )}

        {createMode && (
          <>
            <PasswordManagerForm
              passphrase={generated}
              reveal={reveal}
              onSubmit={submit}
              disabled={!canSubmit}
              label={busy ? 'Creating…' : 'Create encrypted storage'}
            />
            <View style={styles.row}>
              <Pressable style={styles.chip} onPress={() => setReveal((r) => !r)}>
                <Text style={styles.chipText}>{reveal ? 'Hide' : 'Show'}</Text>
              </Pressable>
              <Pressable style={styles.chip} onPress={copy}>
                <Text style={styles.chipText}>Copy</Text>
              </Pressable>
              <Pressable style={styles.chip} onPress={download}>
                <Text style={styles.chipText}>Download</Text>
              </Pressable>
              <Pressable style={styles.chip} onPress={() => { setGenerated(generatePassphrase()); setSaved(false); setNotice(null); }}>
                <Text style={styles.chipText}>New</Text>
              </Pressable>
            </View>
            <Pressable style={styles.checkRow} onPress={() => setSaved((v) => !v)}>
              <View style={[styles.checkbox, saved && styles.checkboxOn]} />
              <Text style={styles.checkLabel}>I have saved this passphrase</Text>
            </Pressable>
            {notice && <Text style={styles.hint}>{notice}</Text>}
            <Pressable onPress={() => setOwnMode(true)}>
              <Text style={styles.link}>Use my own passphrase instead</Text>
            </Pressable>
          </>
        )}

        {!createMode && (
          <>
            {!isFirstUse && bioEnrolled && (
              <Pressable
                style={({ pressed }) => [styles.button, (busy || pressed) && styles.buttonDisabled]}
                onPress={tryBiometric}
                disabled={busy}
              >
                <Text style={styles.buttonText}>Unlock with biometrics</Text>
              </Pressable>
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

            {isFirstUse && (
              <Pressable onPress={() => setOwnMode(false)}>
                <Text style={styles.link}>Use a generated passphrase instead</Text>
              </Pressable>
            )}
          </>
        )}

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
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 999,
    paddingVertical: 8, paddingHorizontal: 14,
  },
  chipText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: colors.mutedForeground },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkLabel: { color: '#FFFFFF', fontSize: 14 },
  link: { color: colors.primary, fontSize: 13, textAlign: 'center' },
  hint: {
    color: colors.mutedForeground,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
});
