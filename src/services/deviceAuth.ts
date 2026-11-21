// Native device authentication (biometrics with device PIN/password fallback).
// NOT a passkey/WebAuthn flow — that one is web-only (src/db/web/biometric.ts).
// The .web.ts twin keeps expo-local-authentication out of the PWA bundle.
import * as LocalAuthentication from 'expo-local-authentication';
import { getStorageAdapter } from '../db';
import { APP_LOCK_KEY, parseLockFlag, type DeviceAuthCapability } from '../utils/appLock';

export const DEVICE_AUTH_SUPPORTED = true;

export async function getDeviceAuthCapability(): Promise<DeviceAuthCapability> {
  const [hasHardware, isEnrolled, securityLevel] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.getEnrolledLevelAsync(),
  ]);
  return { hasHardware, isEnrolled, securityLevel: Number(securityLevel) };
}

/** True only on a successful authentication. Cancels/errors resolve false. */
export async function authenticateDevice(promptMessage = 'Unlock 4MyTravels'): Promise<boolean> {
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false, // allow device PIN / password
    });
    return r.success;
  } catch {
    return false;
  }
}

export async function readAppLockEnabled(): Promise<boolean> {
  const rows = await getStorageAdapter().query<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?', [APP_LOCK_KEY],
  );
  return parseLockFlag(rows[0]?.value);
}

export async function writeAppLockEnabled(on: boolean): Promise<void> {
  await getStorageAdapter().exec(
    'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [APP_LOCK_KEY, on ? '1' : '0'],
  );
  appLockListeners.forEach((l) => l(on));
}

type Listener = (on: boolean) => void;
const appLockListeners = new Set<Listener>();
export function subscribeAppLock(l: Listener): () => void {
  appLockListeners.add(l);
  return () => { appLockListeners.delete(l); };
}
