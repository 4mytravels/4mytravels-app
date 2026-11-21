// Native app lock (expo-local-authentication): pure decision helpers.
// No React, no storage — scripts/test-app-lock.mjs compiles this file alone.
//
// Security model: this is a UI lock only. The SQLCipher key stays in the
// Android Keystore (expo-secure-store) exactly as before and the database is
// opened at boot regardless of this setting; the lock hides the UI until the
// device owner authenticates (biometrics or device PIN/password).

export const APP_LOCK_KEY = 'native_app_lock';

/** Return from background after this long re-locks the app. */
export const RELOCK_AFTER_MS = 60_000;

export function parseLockFlag(value: string | null | undefined): boolean {
  return value === '1' || value === 'true';
}

/**
 * Should the app re-lock when it becomes active again?
 * - lock disabled           -> false
 * - never went to background -> false
 * - away >= RELOCK_AFTER_MS  -> true
 */
export function shouldRelock(
  enabled: boolean,
  backgroundAt: number | null,
  now: number,
  thresholdMs: number = RELOCK_AFTER_MS,
): boolean {
  if (!enabled || backgroundAt == null) return false;
  return now - backgroundAt >= thresholdMs;
}

export interface DeviceAuthCapability {
  hasHardware: boolean;
  isEnrolled: boolean;
  /** SecurityLevel from expo-local-authentication: 0 NONE, 1 SECRET (PIN), 2+ biometric. */
  securityLevel: number;
}

/**
 * Can the lock be turned on? Biometric hardware + enrolment, OR at least a
 * device PIN/password (the prompt allows the device credential as fallback).
 * Returns null when OK, otherwise a user-facing reason.
 */
export function lockUnavailableReason(c: DeviceAuthCapability): string | null {
  if (c.hasHardware && c.isEnrolled) return null;
  if (c.securityLevel >= 1) return null;
  if (!c.hasHardware) return 'This device has no biometric hardware and no screen lock. Set a device PIN or password first.';
  return 'No fingerprint, face or device PIN is set up. Add one in your device settings first.';
}
