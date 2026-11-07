// ModalHost — the wrapper for a full-screen sheet that is opened from INSIDE
// the app (the expense form on home / expenses / trip detail).
//
// WHY THIS EXISTS
// A picker sheet (PickerSheet → SheetPortal) is portalled into `document.body`.
// Hosting the expense form in react-native-web's <Modal> therefore put the
// search field OUTSIDE the modal's DOM subtree — and RNW's Modal installs
// `ModalFocusTrap`, a document-level CAPTURE `focus` listener that yanks focus
// back to the first focusable element inside the modal whenever focus lands
// outside it. Measured on the PWA: tapping "Search currency" produced
//   focus → INPUT#Search currency → focus → DIV
// i.e. the field was hit-testable (elementFromPoint returned the INPUT) but
// could never hold focus, so the user could not select it at all.
// `app/trips/new` is a ROUTE (not a Modal), which is why the very same picker
// works there — "search works in edit trip but not in add expense".
//
// The fix is to stop using RNW's <Modal> on web: this host renders the form as
// a body-level portal overlay (z-index 9000, BELOW SheetPortal's 10000 so a
// picker still paints on top of it). No focus trap, no RNW transform
// containing block. Native keeps the real <Modal>.

import { PropsWithChildren } from 'react';
import { Modal } from 'react-native';

export function ModalHost({
  visible,
  onRequestClose,
  children,
}: PropsWithChildren<{
  visible: boolean;
  onRequestClose?: () => void;
  /** Kept for call-site parity with the old <Modal animationType="slide">. */
  animationType?: 'slide' | 'fade' | 'none';
}>) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onRequestClose}>
      {children}
    </Modal>
  );
}
