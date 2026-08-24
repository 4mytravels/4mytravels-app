// Encrypted local backup / restore (MVP scope §2.2).
//
// Design (privacy-first, FLOSS, no native deps so it works on both Android and
// the PWA):
//   - Key derived from the user's passphrase via Argon2id (same model as the
//     planned PWA live DB key — §2.2). The device key (Keystore) is NEVER used
//     here, so the backup is portable across devices.
//   - Payload encrypted with XChaCha20-Poly1305 (nonce + auth tag).
//   - Format: { v, kdf, salt, nonce, ciphertext } — a single self-describing
//     JSON envelope. The schema version + app version live in the plaintext
//     manifest inside the ciphertext so restore can validate compatibility.
//
// NOTE: the scope mentions a zip container; a single encrypted JSON envelope is
// used instead to avoid a native zip dependency while keeping the same security
// and portability properties. Can be wrapped in zip later without API change.

import { argon2id } from '@noble/hashes/argon2.js';
import { randomBytes, bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { loadTrips } from './tripRepo';
import { loadExpenses } from './expenseRepo';
import { getStorageAdapter } from './index';
import type { Trip, Expense } from '../types/index';

export const BACKUP_FORMAT_VERSION = 1;
const ARGON2 = {
  t: 3, // iterations
  m: 64 * 1024, // 64 MB memory
  p: 1, // parallelism
  dkLen: 32, // 256-bit key
  version: 0x13, // Argon2id
} as const;

interface BackupEnvelope {
  v: number;
  kdf: 'argon2id';
  salt: string; // hex
  nonce: string; // hex
  ciphertext: string; // hex
}

function deriveKey(passphrase: string, salt: Uint8Array): Uint8Array {
  return argon2id(utf8ToBytes(passphrase), salt, ARGON2);
}

export async function createBackup(passphrase: string): Promise<string> {
  const trips = await loadTrips(getStorageAdapter());
  const expenses = await loadExpenses(undefined, getStorageAdapter());
  const manifest = {
    schemaVersion: BACKUP_FORMAT_VERSION,
    appVersion: '1.0.0',
    exportedAt: new Date().toISOString(),
    trips,
    expenses,
  };
  const salt = randomBytes(16);
  const nonce = randomBytes(24); // XChaCha20 nonce is 24 bytes
  const key = deriveKey(passphrase, salt);
  const cipher = xchacha20poly1305(key, nonce);
  const plaintext = utf8ToBytes(JSON.stringify(manifest));
  const ciphertext = cipher.encrypt(plaintext);
  const envelope: BackupEnvelope = {
    v: BACKUP_FORMAT_VERSION,
    kdf: 'argon2id',
    salt: bytesToHex(salt),
    nonce: bytesToHex(nonce),
    ciphertext: bytesToHex(ciphertext),
  };
  return JSON.stringify(envelope);
}

export interface RestoreResult {
  trips: Trip[];
  expenses: Expense[];
}

export async function restoreBackup(envelopeJson: string, passphrase: string): Promise<RestoreResult> {
  const env = JSON.parse(envelopeJson) as BackupEnvelope;
  if (env.kdf !== 'argon2id') throw new Error('Unsupported backup format');
  const salt = hexToBytes(env.salt);
  const nonce = hexToBytes(env.nonce);
  const key = deriveKey(passphrase, salt);
  const cipher = xchacha20poly1305(key, nonce);
  let plaintext: Uint8Array;
  try {
    plaintext = cipher.decrypt(hexToBytes(env.ciphertext));
  } catch {
    throw new Error('Decryption failed — wrong passphrase or corrupted backup');
  }
  const manifest = JSON.parse(new TextDecoder().decode(plaintext));
  if (manifest.schemaVersion !== BACKUP_FORMAT_VERSION) {
    throw new Error(`Unsupported backup schema v${manifest.schemaVersion}`);
  }
  return { trips: manifest.trips ?? [], expenses: manifest.expenses ?? [] };
}
