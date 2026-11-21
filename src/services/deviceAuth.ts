// Native device authentication (biometrics with device PIN/password fallback).
// NOT a passkey/WebAuthn flow — that one is web-only (src/db/web/biometric.ts).
// The .web.ts twin keeps expo-local-authentication out of the PWA bundle.
import { requireOptionalNativeModule } from 'expo-modules-core';
import { getStorageAdapter } from '../db';
import { APP_LOCK_KEY, parseLockFlag, type DeviceAuthCapability } from '../utils/appLock';

// A dev-client / APK built before expo-local-authentication was added has no
// native module; a static import then crashes the whole app at boot. Probe
// first and only require the JS wrapper when the native side exists.
export const DEVICE_AUTH_SUPPORTED =
  requireOptionalNativeModule('ExpoLocalAuthentication') != null;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const LocalAuthentication: typeof import('expo-local-authentication') | null =
  DEVICE_AUTH_SUPPORTED ? require('expo-local-authentication') : null;

export async function getDeviceAuthCapability(): Promise<DeviceAuthCapability> {
  if (!LocalAuthentication) return { hasHardware: false, isEnrolled: false, securityLevel: 0 };
  const [hasHardware, isEnrolled, securityLevel] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.getEnrolledLevelAsync(),
  ]);
  return { hasHardware, isEnrolled, securityLevel: Number(securityLevel) };
}

/** True only on a successful authentication. Cancels/errors resolve false. */
export async function authenticateDevice(promptMessage = 'Unlock 4MyTravels'): Promise<boolean> {
  if (!LocalAuthentication) return false;
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
  // Without the native module the lock can't be unlocked; it could only have
  // been enabled on a build that had it, so treat it as off here.
  if (!DEVICE_AUTH_SUPPORTED) return false;
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
