// Glue: enroll biometric unlock using the key of the currently unlocked session.
import { getStorageAdapter } from '../index';
import { enrollBiometric } from './biometric';

export async function enrollBiometricForSession(): Promise<void> {
  const a = getStorageAdapter() as unknown as { getSessionKeyHex?: () => string | null };
  const keyHex = a.getSessionKeyHex?.();
  if (!keyHex) throw new Error('Storage is locked');
  await enrollBiometric(keyHex);
}
