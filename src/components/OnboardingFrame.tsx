// OnboardingFrame — native. A real <Modal> whose back button does nothing:
// first-start onboarding must be completed ("Get started"), never dismissed.
// Web counterpart: OnboardingFrame.web.tsx (body portal, z-index 10000).
import type { ReactNode } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { colors, spacing, themedStyles } from '../theme/theme';

export function OnboardingFrame({ children }: { children: ReactNode }) {
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => { /* not dismissible */ }}>
      <View style={styles.overlay}>
        <View style={styles.backdrop} />
        {children}
      </View>
    </Modal>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  // No onPress: a tap on the backdrop must not close the dialog.
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrimStrong },
}));
