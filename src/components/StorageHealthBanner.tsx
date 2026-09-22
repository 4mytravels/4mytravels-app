// Web-only storage health banner (plan Task 5). Surfaces the active VFS mode
// from the WasmStorageAdapter: OPFS-sahpool is the good path; the IndexedDB
// snapshot fallback gets a gentle notice; a memory mode (no persistence at
// all — should not normally happen) gets a loud data-loss warning.

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/theme';

type Level = 'ok' | 'fallback' | 'volatile';

const COPY: Record<Level, { label: string; detail: string }> = {
  ok: {
    label: 'Encrypted local storage active',
    detail: 'Your data is encrypted and stored in this browser.',
  },
  fallback: {
    label: 'Limited storage mode',
    detail:
      'This browser session uses an encrypted IndexedDB snapshot instead of ' +
      'full file storage. Data persists, but works best in a normal (non-private) ' +
      'browser window.',
  },
  volatile: {
    label: 'Temporary storage — data will be lost',
    detail:
      'No persistent storage is available here. Your data disappears when you ' +
      'close this page. Use a normal browser window or install the app.',
  },
};

export function StorageHealthBanner() {
  const [level, setLevel] = useState<Level | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Poll the adapter's vfs mode once storage is up. Uses the module-scope
    // getter injected at render time by _layout (web branch) to avoid an
    // import cycle: window.__fourmytravels_storage_health().
    const read = () => {
      try {
        const h = (globalThis as unknown as {
          __fourmytravels_storage_health?: () => { vfs: string } | null;
        }).__fourmytravels_storage_health?.();
        if (!h) return;
        if (h.vfs === 'sahpool') setLevel('ok');
        else if (h.vfs === 'idb') setLevel('fallback');
        else if (h.vfs === 'memory') setLevel('volatile');
      } catch {
        /* not ready yet */
      }
    };
    read();
    const t = setInterval(read, 2000);
    return () => clearInterval(t);
  }, []);

  if (!level || dismissed || level === 'ok') return null;
  const copy = COPY[level];

  return (
    <View style={[styles.wrap, level === 'volatile' ? styles.wrapVolatile : styles.wrapFallback]}>
      <View style={styles.body}>
        <Text style={styles.label}>{copy.label}</Text>
        <Text style={styles.detail}>{copy.detail}</Text>
      </View>
      <Pressable onPress={() => setDismissed(true)} hitSlop={8}>
        <Text style={styles.close}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  wrapFallback: {
    backgroundColor: 'rgba(251,191,36,0.10)',
    borderColor: 'rgba(251,191,36,0.30)',
  },
  wrapVolatile: {
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderColor: 'rgba(248,113,113,0.35)',
  },
  body: { flex: 1, gap: 4 },
  label: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  detail: { color: colors.mutedForeground, fontSize: 12, lineHeight: 17 },
  close: { color: colors.mutedForeground, fontSize: 14 },
});
