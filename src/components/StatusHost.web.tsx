// StatusHost — web implementation.
//
// A real DOM portal into `document.body` at z-index 10000, same reasoning as
// ConfirmHost.web.tsx: react-native-web gives every View `position: relative`
// (an absolute overlay resolves against the nearest ancestor) and RNW's Modal
// root carries an identity transform plus z-index 9999, which would clip or
// paint behind a plain overlay.
//
// Backdrop and dialog are SIBLINGS so a tap inside the dialog can never reach
// the backdrop's onPress.
import { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { getCurrentStatus, dismissStatus, subscribeStatus } from '../utils/statusDialog';
import { colors, fontFamily, radius, fontSize, spacing } from '../theme/theme';

// Declared locally: @types/react-dom is not installed in this project, and the
// import must not reach the native bundle (web-only via Metro .web resolution).
const { createPortal } = require('react-dom') as {
  createPortal: (node: React.ReactNode, container: Element) => React.ReactPortal;
};

export function StatusHost() {
  const request = useSyncExternalStore(
    subscribeStatus,
    getCurrentStatus,
    () => null,
  );

  if (!request) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={() => dismissStatus()} />
      <View style={styles.dialog}>
        <Text style={styles.title}>{request.title}</Text>
        {request.message ? <Text style={styles.message}>{request.message}</Text> : null}
        <Pressable
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          onPress={() => dismissStatus()}
        >
          <Text style={styles.actionText}>OK</Text>
        </Pressable>
      </View>
    </View>,
    document.body,
  );
}

const styles = StyleSheet.create({
  overlay: {
    // RN's ViewStyle union has no 'fixed' (native has no such keyword); on web
    // react-native-web emits the value verbatim, which is what we need.
    position: 'fixed' as unknown as ViewStyle['position'],
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10000,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
  } as unknown as ViewStyle,
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5,5,15,0.72)',
  },
  dialog: {
    // Fixed width, not a percentage: react-native-web resolves `width: '100%'`
    // against a shrink-to-fit parent, so a percentage would collapse.
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
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
  },
  actionPressed: { opacity: 0.8 },
  actionText: {
    color: colors.primaryForeground,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
