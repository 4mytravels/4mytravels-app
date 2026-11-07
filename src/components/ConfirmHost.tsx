// ConfirmHost — native implementation.
//
// The web counterpart is ConfirmHost.web.tsx (a document.body portal); Metro's
// platform resolution picks that file for web, so this file stays DOM-free.
//
// Mounted ONCE in app/_layout.tsx, above the navigator. `confirmDestructive`
// (src/utils/confirm.ts) publishes a request to a module-scope store; this host
// subscribes with `useSyncExternalStore` and renders it.
//
// WHY NOT Alert.alert for this: on web Alert's buttons never render, and
// `window.confirm` is auto-dismissed by Chrome when the page has not been
// interacted with — both silently skip the delete, which reads as a dead
// button. The host is therefore the single, platform-correct dialog.

import { useSyncExternalStore } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  answerConfirm,
  cancelPendingConfirm,
  getCurrentConfirm,
  subscribeConfirm,
} from '../utils/confirm';
import { colors, fontFamily, radius, fontSize, spacing } from '../theme/theme';

export function ConfirmHost() {
  const request = useSyncExternalStore(
    subscribeConfirm,
    getCurrentConfirm,
    // getServerSnapshot: no dialog during SSR (the prerendered HTML must match
    // the first client render).
    () => null,
  );

  const answer = (ok: boolean) => answerConfirm(ok);

  if (!request) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => cancelPendingConfirm()}>
      <Pressable style={styles.backdrop} onPress={() => answer(false)}>
        <Pressable style={styles.dialog} onPress={() => undefined}>
          <Text style={styles.title}>{request.title}</Text>
          <Text style={styles.message}>{request.message}</Text>
          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
              onPress={() => answer(false)}
            >
              <Text style={styles.actionText}>{request.cancelLabel}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.action, styles.actionDanger, pressed && styles.actionPressed]}
              onPress={() => answer(true)}
            >
              <Ionicons name="trash-outline" size={16} color="#FFFFFF" />
              <Text style={styles.actionTextDanger}>{request.confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['2xl'],
    backgroundColor: 'rgba(5,5,15,0.72)',
  },
  dialog: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.card,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  title: {
    color: colors.foreground,
    fontFamily: fontFamily.heading,
    fontSize: fontSize.xl,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  message: {
    color: colors.mutedForeground,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.md,
    lineHeight: 21,
    marginBottom: spacing.xl,
  },
  actions: { flexDirection: 'row', gap: spacing.md },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionPressed: { opacity: 0.8 },
  actionDanger: { backgroundColor: colors.destructive, borderColor: colors.destructive },
  actionText: {
    color: colors.foreground,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  actionTextDanger: {
    color: '#FFFFFF',
    fontFamily: fontFamily.sans,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
