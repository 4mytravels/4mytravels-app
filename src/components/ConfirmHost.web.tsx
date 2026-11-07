// ConfirmHost — web implementation.
//
// A real DOM portal into `document.body` (z-index 10000), mirroring
// SheetPortal.web.tsx and ModalHost.web.tsx:
//   - react-native-web gives every View `position: relative`, so an absolute
//     overlay resolves against the nearest ancestor — a dialog opened from a
//     bottom sheet would be boxed into the sheet's section.
//   - RNW's `<Modal>` root (the sheet that asked for the confirmation) carries
//     an identity transform and z-index 9999, which both clips a fixed overlay
//     and paints it BEHIND the sheet.
//
// The backdrop and the dialog are SIBLINGS: a tap inside the dialog can never
// reach the backdrop's onPress (the nested-Pressable + stopPropagation pattern
// was unreliable — see the PickerSheet notes).
//
// Metro's `.web` resolution keeps this file out of the native bundle.
import { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  answerConfirm,
  cancelPendingConfirm,
  getCurrentConfirm,
  subscribeConfirm,
} from '../utils/confirm';
import { colors, fontFamily, radius, fontSize, spacing } from '../theme/theme';

// Declared locally: @types/react-dom is not installed in this project, and the
// import must not reach the native bundle (web-only via Metro .web resolution).
const { createPortal } = require('react-dom') as {
  createPortal: (node: React.ReactNode, container: Element) => React.ReactPortal;
};

export function ConfirmHost() {
  const request = useSyncExternalStore(
    subscribeConfirm,
    getCurrentConfirm,
    () => null,
  );

  const answer = (ok: boolean) => answerConfirm(ok);

  if (!request) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <View style={styles.overlay}>
      {/* Sibling backdrop, not a wrapper: a tap inside the dialog never reaches it. */}
      <Pressable style={styles.backdrop} onPress={() => answer(false)} />
      <View style={styles.dialog}>
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
      </View>
    </View>,
    document.body,
  );
}

const styles = StyleSheet.create({
  overlay: {
    // RN's ViewStyle union has no 'fixed' (native has no such keyword); on web
    // react-native-web emits the value verbatim, which is what we need here.
    position: 'fixed' as unknown as ViewStyle['position'],
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // Above RNW's Modal (9999) and above the sheet that asked for this dialog.
    zIndex: 10000,
    // Centre with the flex container only — no top:50% + negative margin, which
    // react-native-web resolves against a shrink-to-fit parent.
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
  } as unknown as ViewStyle,
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,5,15,0.72)' },
  dialog: {
    // Fixed width, not a percentage: react-native-web resolves `width: '100%'`
    // against a shrink-to-fit parent, so a percentage would collapse here.
    width: 380,
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
