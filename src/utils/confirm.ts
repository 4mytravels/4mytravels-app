// Confirmation dialog for destructive actions.
//
// `Alert.alert` is a NO-OP in react-native-web: on the PWA a delete would look
// like it did nothing (the sheet closes, no dialog, nothing happens) because the
// buttons never render. The web build therefore uses the browser's own
// window.confirm; native keeps the platform dialog with a destructive button.
import { Alert, Platform } from 'react-native';

export function confirmDestructive(opts: {
  /** Dialog title (native) — also the confirm prompt on web. */
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
}): void {
  const { title, message, confirmLabel = 'Delete', cancelLabel = 'Cancel', onConfirm } = opts;

  if (Platform.OS === 'web') {
    const ok =
      typeof window === 'undefined' || typeof window.confirm !== 'function'
        ? true
        : window.confirm(`${title}\n\n${message}`);
    if (ok) onConfirm();
    return;
  }

  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}