// Argon2id passphrase → raw key derivation for the PWA database (Task 3,
// MVP scope §2.2 "PWA key management"). Same key model as the local backup
// file: passphrase-derived, portable, session-held — never persisted raw.

import { argon2idAsync } from '@noble/hashes/argon2.js';

// Parameters tuned for mid-range phones (measure on device; target < ~500 ms).
// 64 MiB / t=3 / p=1 is a solid baseline for a local KDF in 2026.
const ARGON2_MEMORY_KIB = 64 * 1024;
const ARGON2_ITERATIONS = 3;
const ARGON2_PARALLELISM = 1;
const KEY_LENGTH = 32;

/** Fixed app-context salt prefix; per-database random suffix comes from the salt store. */
const SALT_PREFIX = '4mytravels-pwa-v1';

/**
 * Derive the 32-byte database key from a passphrase and the per-database salt.
 * The salt is public (stored alongside the db) — its only job is making
 * rainbow/precomputed attacks on the passphrase impossible.
 * Async variant keeps the UI thread free during the ~100-500 ms derivation.
 */
export async function deriveKeyHex(passphrase: string, salt: string): Promise<string> {
  if (!passphrase) throw new Error('passphrase required');
  if (!salt) throw new Error('salt required');
  const key = await argon2idAsync(
    new TextEncoder().encode(passphrase),
    new TextEncoder().encode(SALT_PREFIX + ':' + salt),
    { t: ARGON2_ITERATIONS, m: ARGON2_MEMORY_KIB, p: ARGON2_PARALLELISM, dkLen: KEY_LENGTH },
  );
  return toHex(key);
}

/** Random salt for a new database (hex, 16 bytes). */
export function newSalt(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return toHex(b);
}

function toHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}
