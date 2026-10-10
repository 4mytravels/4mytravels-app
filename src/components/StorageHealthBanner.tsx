// Web-only storage health banner (plan Task 5). Surfaces the active VFS mode
// from the WasmStorageAdapter: OPFS-sahpool is the good path; the IndexedDB
// snapshot fallback gets a gentle notice; a memory mode (no persistence at
// all — should not normally happen) gets a loud data-loss warning.

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme/theme';

type Level = 'ok' | 'fallback' | 'volatile';

// The tab navigator keeps visited screens mounted, so several copies of this
// banner exist at once. A per-instance `dismissed` flag meant closing the notice
// on one tab left it on the others; share the state at module scope instead.
let dismissedState = false;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function dismiss() {
  dismissedState = true;
  for (const cb of listeners) cb();
}

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
  const dismissed = useSyncExternalStore(
    subscribe,
    () => dismissedState,
    () => false,
  );

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
      <Pressable onPress={dismiss} hitSlop={8}>
        <Text style={styles.close}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Layout flow inside WebNotices, directly under the screen header — same
  // placement as the install nudge (user request). OPAQUE surfaces: these are
  // notices the user has to read, so the old translucent tints are baked over
  // the #0A0A1A background.
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  wrapFallback: {
    backgroundColor: '#2A2214', // amber @16% over the background, as a solid
    borderColor: 'rgba(251,191,36,0.30)',
  },
  wrapVolatile: {
    backgroundColor: '#2C1A1C', // red @18% over the background, as a solid
    borderColor: 'rgba(248,113,113,0.35)',
  },
  body: { flex: 1, gap: 4 },
  label: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  detail: { color: colors.mutedForeground, fontSize: 12, lineHeight: 17 },
  close: { color: colors.mutedForeground, fontSize: 14 },
});
