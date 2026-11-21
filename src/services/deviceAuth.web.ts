// PWA: no native app lock. The PWA's own unlock is the passphrase gate with
// optional WebAuthn-PRF (passkey) biometric unlock — see src/db/web/biometric.ts.
import type { DeviceAuthCapability } from '../utils/appLock';

export const DEVICE_AUTH_SUPPORTED = false;

export async function getDeviceAuthCapability(): Promise<DeviceAuthCapability> {
  return { hasHardware: false, isEnrolled: false, securityLevel: 0 };
}
export async function authenticateDevice(): Promise<boolean> { return false; }
export async function readAppLockEnabled(): Promise<boolean> { return false; }
export async function writeAppLockEnabled(): Promise<void> { /* native only */ }
export function subscribeAppLock(): () => void { return () => {}; }
