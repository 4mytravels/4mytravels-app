// Native app lock screen (Settings > Security > "Lock app with biometrics").
// UI lock only: the database is already open with its Keystore key; this
// hides everything until authenticateAsync succeeds (biometrics, or the
// device PIN/password as fallback). Locks at start and after returning from
// background >= RELOCK_AFTER_MS. Mounted last in app/_layout.tsx (after the
// onboarding host) so its Modal paints on top of everything.
import { useEffect, useRef, useState } from 'react';
import { AppState, Modal, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authenticateDevice, readAppLockEnabled, subscribeAppLock } from '../services/deviceAuth';
import { shouldRelock } from '../utils/appLock';
import { colors, fontFamily, fontSize, spacing, themedStyles } from '../theme/theme';
import { Button } from './ui';

export function AppLockHost() {
  const [enabled, setEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const [checked, setChecked] = useState(false);
  const enabledRef = useRef(false);
  const backgroundAt = useRef<number | null>(null);
  const prompting = useRef(false);

  const unlock = async () => {
    if (prompting.current) return;
    prompting.current = true;
    try {
      if (await authenticateDevice()) setLocked(false);
    } finally {
      prompting.current = false;
    }
  };

  useEffect(() => {
    let alive = true;
    readAppLockEnabled()
      .then((on) => {
        if (!alive) return;
        enabledRef.current = on;
        setEnabled(on);
        if (on) setLocked(true);
      })
      .catch(() => { /* unreadable setting: never trap the user */ })
      .finally(() => { if (alive) setChecked(true); });
    const unsub = subscribeAppLock((on) => { enabledRef.current = on; setEnabled(on); });
    return () => { alive = false; unsub(); };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') {
        backgroundAt.current = Date.now();
      } else if (s === 'active') {
        if (shouldRelock(enabledRef.current, backgroundAt.current, Date.now())) setLocked(true);
        backgroundAt.current = null;
      }
    });
    return () => sub.remove();
  }, []);

  // Auto-prompt whenever the lock engages (start / return from background).
  useEffect(() => {
    if (locked && AppState.currentState === 'active') void unlock();
  }, [locked]);

  if (!checked || !enabled || !locked) return null;

  return (
    <Modal visible animationType="none" transparent={false} onRequestClose={() => { /* stay locked */ }}>
      <View style={styles.root}>
        <Ionicons name="lock-closed-outline" size={48} color={colors.primary} />
        <Text style={styles.title}>4MyTravels is locked</Text>
        <Text style={styles.message}>Use your fingerprint, face or device PIN to continue.</Text>
        <Button label="Unlock" icon="finger-print-outline" onPress={() => void unlock()} />
      </View>
    </Modal>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: { fontFamily: fontFamily.heading, fontSize: fontSize.xl, color: colors.foreground, textAlign: 'center' },
  message: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.mutedForeground, textAlign: 'center', marginBottom: spacing.md },
}));
