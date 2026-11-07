// Status message (success / failure) that actually renders on the PWA.
//
// `Alert.alert` is a NO-OP in react-native-web: every "Import failed", "Import
// complete", "Restore failed" in the app was invisible on the PWA. The user
// reported an import from a cloud drive as "er gebeurt helemaal niets" — the
// error was thrown and swallowed by a dead dialog. Same root cause and same
// remedy as `confirmDestructive`: an in-app host rendered by
// `StatusHost` (mounted once in app/_layout.tsx).
//
// Native keeps the platform alert — it works there and costs no extra UI.
import { Alert, Platform } from 'react-native';

type Listener = () => void;

export interface StatusRequest {
  title: string;
  message: string;
}

let current: StatusRequest | null = null;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

/** Show a status message. Non-blocking; replaces any message already open. */
export function showStatus(title: string, message = ''): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message);
    return;
  }
  current = { title, message };
  emit();
}

/** The message the host renders right now, or null. */
export function getCurrentStatus(): StatusRequest | null {
  return current;
}

export function subscribeStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Dismiss the open message. Only the host calls this. */
export function dismissStatus(): void {
  if (!current) return;
  current = null;
  emit();
}
