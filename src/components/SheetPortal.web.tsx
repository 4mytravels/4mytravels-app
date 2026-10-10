// SheetPortal — web implementation.
//
// A real DOM portal is REQUIRED here, not just `position: fixed`:
//   - react-native-web gives every View `position: relative`, so an absolute
//     overlay resolves against the enclosing form section.
//   - `position: fixed` alone does not help either: the RNW ScrollView and the
//     RNW Modal root both carry an (identity) `transform: matrix(1,0,0,1,0,0)`,
//     and ANY transform — identity included — makes that element the
//     containing block for fixed-position descendants. The overlay stayed
//     clipped to the scroll area (measured: h 387 instead of the 577 viewport).
// Portalling into document.body escapes all of those ancestors, so the sheet
// behaves as a proper full-screen bottom sheet.
//
// react-native-web cannot render a <Modal> nested inside another <Modal>
// (ExpenseForm is itself a Modal), hence this hand-rolled overlay. Native keeps
// the real Modal — see SheetPortal.tsx.

import React, { PropsWithChildren } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

// Declared locally: @types/react-dom is not installed in this project and the
// import must not be pulled into the native bundle (this file is web-only via
// Metro's .web resolution).
const { createPortal } = require('react-dom') as {
  createPortal: (node: React.ReactNode, container: Element) => React.ReactPortal;
};

export function SheetPortal({
  visible,
  children,
}: PropsWithChildren<{ visible: boolean; onRequestClose: () => void }>) {
  if (!visible) return null;
  if (typeof document === 'undefined') return null;
  return createPortal(<View style={styles.overlay}>{children}</View>, document.body);
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
    // react-native-web's <Modal> root uses `z-index: 9999`. The sheet must
    // stack above it or it is painted BEHIND the modal it belongs to (measured:
    // geometry correct, but elementFromPoint hit the form section instead).
    zIndex: 10000,
  },
});
