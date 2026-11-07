// Confirmation dialog for destructive actions.
//
// `Alert.alert` is a NO-OP in react-native-web, so the web build needs its own
// dialog. `window.confirm` is NOT dependable on the PWA either: Chrome
// auto-dismisses it ("prevent abusive dialogs" — the call returns false without
// ever showing a dialog) when the page has not been interacted with, and some
// embedded browsers return false for it entirely. A refused confirm() silently
// skips the delete, which the user reads as "the delete button does nothing".
//
// So on web every destructive action goes through the in-app dialog rendered by
// `ConfirmHost` (mounted once in app/_layout.tsx). The host is a
// `useSyncExternalStore` store, so a dialog opened from any screen — including
// one opened from a bottom sheet that is about to close — is painted above it
// and is never clipped.
//
// `confirmDestructive` resolves `true` when the user confirms, `false` when they
// cancel. Callers MUST await it and must not close their own sheet before the
// answer is known.
import { Alert, Platform } from 'react-native';

type Listener = () => void;

interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  resolve: (ok: boolean) => void;
}

let current: ConfirmRequest | null = null;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

export function confirmDestructive(opts: {
  /** Dialog title — also the confirm prompt on web. */
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}): Promise<boolean> {
  const { title, message, confirmLabel = 'Delete', cancelLabel = 'Cancel' } = opts;

  // A second request must never sit on top of the first: resolve it as cancelled.
  if (current) current.resolve(false);
  current = null;

  if (Platform.OS !== 'web') {
    // Native keeps the platform dialog (Alert.alert works there).
    return new Promise<boolean>((resolve) => {
      Alert.alert(title, message, [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
      ]);
    });
  }

  return new Promise<boolean>((resolve) => {
    const thisResolve = (ok: boolean) => {
      if (current && current.resolve === thisResolve) current = null;
      emit();
      resolve(ok);
    };
    current = {
      title,
      message,
      confirmLabel,
      cancelLabel,
      resolve: thisResolve,
    };
    emit();
  });
}

export function cancelPendingConfirm(): void {
  if (!current) return;
  current.resolve(false);
  current = null;
  emit();
}

/** The dialog the host renders right now, or null. */
export function getCurrentConfirm(): ConfirmRequest | null {
  return current;
}

export function subscribeConfirm(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Answer the open dialog. Only the host calls this. */
export function answerConfirm(ok: boolean): void {
  if (!current) return;
  const req = current;
  current = null;
  emit();
  req.resolve(ok);
}
