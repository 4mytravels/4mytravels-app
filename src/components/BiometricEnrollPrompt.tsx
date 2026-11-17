// Web only: after the storage is unlocked, offer biometric unlock once so the
// passphrase is only needed for recovery. Dismissal is remembered; Settings
// keeps a toggle. Renders nothing on native or when WebAuthn PRF is unavailable.
import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { colors, themedStyles } from '../theme/theme';
import {
  dismissBiometricPrompt,
  isBiometricAvailable,
  isBiometricEnrolled,
  wasBiometricDismissed,
} from '../db/web/biometric';
import { enrollBiometricForSession } from '../db/web/biometricSession';
import { Button } from './ui';

export function BiometricEnrollPrompt() {
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (isBiometricEnrolled() || wasBiometricDismissed()) return;
    let alive = true;
    void isBiometricAvailable().then((ok) => alive && ok && setVisible(true));
    return () => { alive = false; };
  }, []);

  if (!visible) return null;

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      await enrollBiometricForSession();
      setVisible(false);
    } catch (e) {
      setError(e instanceof Error && e.name === 'BiometricUnsupported'
        ? 'This device or browser does not support biometric unlock. Keep using your passphrase.'
        : 'Biometric setup was cancelled.');
    } finally {
      setBusy(false);
    }
  };

  const later = () => {
    dismissBiometricPrompt();
    setVisible(false);
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.card}>
        <Text style={styles.title}>Unlock with fingerprint or face?</Text>
        <Text style={styles.body}>
          Skip typing your passphrase next time. It stays your recovery key — keep it saved.
        </Text>
        {error && <Text style={styles.error}>{error}</Text>}
        <View style={styles.row}>
          <Button label="Not now" variant="ghost" size="md" style={{ flex: 1 }} onPress={later} disabled={busy} />
          <Button label="Enable" size="md" style={{ flex: 1 }} onPress={enable} loading={busy} />
        </View>
      </View>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, top: 0, padding: 16, alignItems: 'center', zIndex: 9000 },
  card: {
    width: '100%', maxWidth: 420, backgroundColor: colors.card, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border, padding: 16, gap: 8,
  },
  title: { color: colors.foreground, fontSize: 16, fontWeight: '700' },
  body: { color: colors.mutedForeground, fontSize: 13, lineHeight: 18 },
  error: { color: colors.red400, fontSize: 13 },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
  btn: { backgroundColor: colors.primarySolid, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 18 },
  btnText: { color: colors.primaryForeground, fontWeight: '600' },
  ghost: { backgroundColor: 'transparent' },
  ghostText: { color: colors.mutedForeground, fontWeight: '600' },
}));
