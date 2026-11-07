// ModalHost — web implementation (see ModalHost.tsx for the full reasoning).
//
// react-native-web's <Modal> carries ModalFocusTrap: a document-level CAPTURE
// `focus` listener that refocuses the first focusable element inside the modal
// whenever focus moves outside it. PickerSheet portals its search field into
// `document.body`, i.e. OUTSIDE that subtree, so on the PWA the search field
// could not be focused (measured focus log: INPUT#Search currency → DIV).
//
// This host is a plain body-level portal overlay instead: no focus trap, no
// RNW Modal transform containing block, and a z-index BELOW SheetPortal
// (10000) so picker sheets still paint above the form.
//
// NO entry animation on purpose: RN's Animated (including RNW's web
// implementation with useNativeDriver:false) is driven by requestAnimationFrame,
// so an Animated opacity/translate starts at 0 and can stay there wherever rAF
// does not run — the form rendered invisible. A CSS transition would be equally
// unverifiable. The overlay is therefore static: always opacity 1, always at
// top 0, which is what `getBoundingClientRect()` confirms.

import React, { PropsWithChildren, useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

// Declared locally: @types/react-dom is not installed and the import must not
// reach the native bundle (this file is web-only via Metro .web resolution).
const { createPortal } = require('react-dom') as {
  createPortal: (node: React.ReactNode, container: Element) => React.ReactPortal;
};

export function ModalHost({
  visible,
  onRequestClose,
  children,
}: PropsWithChildren<{
  visible: boolean;
  onRequestClose?: () => void;
  animationType?: 'slide' | 'fade' | 'none';
}>) {
  // RNW's Modal closed on Escape; keep that affordance.
  useEffect(() => {
    if (!visible || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onRequestClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible, onRequestClose]);

  if (!visible) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <View style={styles.overlay}>
      <View style={styles.fill}>{children}</View>
    </View>,
    document.body,
  );
}

const styles = StyleSheet.create({
  overlay: {
    // Native's ViewStyle has no 'fixed'; react-native-web emits it verbatim.
    position: 'fixed' as unknown as ViewStyle['position'],
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    // Below SheetPortal's 10000 so a picker/country sheet paints on top.
    zIndex: 9000,
  },
  fill: { flex: 1 },
});
