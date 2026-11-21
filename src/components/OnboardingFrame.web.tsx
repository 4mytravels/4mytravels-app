// OnboardingFrame — web. A document.body portal (NOT an RNW <Modal>): RNW's
// ModalFocusTrap would steal focus from the currency search field (pattern 40).
// z-index 10000 = above RNW's Modal root (9999), same tier as ConfirmHost.web.
// Escape is swallowed and the backdrop has no handler: not dismissible.
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, spacing, themedStyles } from '../theme/theme';

const { createPortal } = require('react-dom') as {
  createPortal: (node: React.ReactNode, container: Element) => React.ReactPortal;
};

export function OnboardingFrame({ children }: { children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <View style={styles.overlay} accessibilityViewIsModal>
      <View style={styles.backdrop} />
      {children}
    </View>,
    document.body,
  );
}

const styles = themedStyles(() => StyleSheet.create({
  overlay: {
    position: 'fixed' as unknown as ViewStyle['position'],
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 10000,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  } as unknown as ViewStyle,
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrimStrong },
}));
