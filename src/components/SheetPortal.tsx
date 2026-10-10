// SheetPortal — native implementation.
//
// A real <Modal> (transparent, fade) — the established native behaviour.
// The web counterpart is SheetPortal.web.tsx (a document.body portal); Metro's
// platform resolution picks that file for web, so this file stays DOM-free.

import React, { PropsWithChildren } from 'react';
import { Modal } from 'react-native';

export function SheetPortal({
  visible,
  onRequestClose,
  children,
}: PropsWithChildren<{ visible: boolean; onRequestClose: () => void }>) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onRequestClose}>
      {children}
    </Modal>
  );
}
