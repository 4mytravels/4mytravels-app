// Pure backup envelope format: build, validate (no passphrase) and decrypt.
// No storage/DB imports so it can be unit-tested in plain Node
// (scripts/test-backup-restore.mjs, scripts/test-backup-roundtrip.mjs).
// See src/db/backup.ts for the design notes.
//
// Restore flow (Settings): pick file → parseBackupEnvelope (structural check,
// NO passphrase needed) → ask passphrase → decryptBackup. A wrong passphrase
// throws BackupPassphraseError so the UI can offer a retry while keeping the
// already-validated envelope.
//
// FORMAT VERSIONS
//   v1 (≤ v1.1.2): ciphertext hex. Inside, Uint8Array photos went through plain
//      JSON.stringify → {"0":255,"1":216,...} (~6 chars per byte), and restore
//      returned those objects instead of bytes. Measured: 3.9 MB of photos →
//      47 MB plaintext → 93 MB file in 9.2 s (Node/V8); ~30 receipts of 350 KB
//      ran the JS heap out of memory.
//   v2: envelope `enc: 'base64'`, ciphertext base64. Inside (schemaVersion 2)
//      the binary fields `receiptPhoto` / `coverBytes` are base64 strings.
//   Restore reads both; v1 photo objects are revived to Uint8Array.
// The crypto (Argon2id params, XChaCha20-Poly1305) is IDENTICAL in v1 and v2.

import { argon2idAsync } from '@noble/hashes/argon2.js';
import { randomBytes, bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import type { Trip, Expense } from '../types/index';

export const BACKUP_FORMAT_VERSION = 2;
const SUPPORTED_VERSIONS: readonly number[] = [1, 2];
export const MIN_PASSPHRASE_LENGTH = 8;

/**
 * Argon2id parameters — deliberately NOT lowered for speed.
 * m = 64 MiB, t = 3, p = 1: the memory/time of RFC 9106 §4's second
 * recommended option (64 MiB, t=3) and well above the OWASP Password Storage
 * minimum (19 MiB, t=2, p=1). Derived exactly ONCE per backup and once per
 * restore attempt. Changing them needs a format bump (old files keep these).
 */
export const ARGON2_PARAMS = {
  t: 3, // iterations
  m: 64 * 1024, // 64 MiB memory (KiB units)
  p: 1, // parallelism
  dkLen: 32, // 256-bit key
  version: 0x13, // Argon2 v1.3
} as const;

export interface BackupEnvelope {
  v: number;
  kdf: 'argon2id';
  salt: string; // hex
  nonce: string; // hex
  ciphertext: string; // v1: hex, v2: base64
  enc?: 'base64'; // v2 only
}

export interface RestoreResult {
  trips: Trip[];
  expenses: Expense[];
}

export type BackupPhase = 'collect' | 'serialize' | 'kdf' | 'encrypt' | 'encode';
export interface BackupProgress {
  /** Called after each phase with its duration in ms (no data, no secrets). */
  onPhase?: (phase: BackupPhase, ms: number) => void;
}

/** The file is not a (supported) 4MyTravels backup. Shown BEFORE any password prompt. */
export class InvalidBackupFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBackupFileError';
  }
}

/** Authenticated decryption failed: wrong passphrase (or tampered ciphertext). Retryable. */
export class BackupPassphraseError extends Error {
  constructor(message = 'Wrong passphrase — the backup could not be decrypted.') {
    super(message);
    this.name = 'BackupPassphraseError';
  }
}

// Async variant yields to the event loop every ~10 ms so the UI keeps painting
// the spinner during the KDF (~1 s desktop, several s on a phone under Hermes).
function deriveKey(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
  return argon2idAsync(utf8ToBytes(passphrase), salt, { ...ARGON2_PARAMS, asyncTick: 10 });
}

const nextTick = () => new Promise<void>((r) => setTimeout(r, 0));
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// --- base64 (no Buffer/btoa dependency: identical on Hermes, web and Node) ---
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_CODES = Uint8Array.from(B64, (c) => c.charCodeAt(0));
const B64_LOOKUP = (() => {
  const t = new Int16Array(256).fill(-1);
  for (let i = 0; i < 64; i++) t[B64_CODES[i]] = i;
  return t;
})();

export function bytesToBase64(bytes: Uint8Array): string {
  const out = new Uint8Array(Math.ceil(bytes.length / 3) * 4);
  let o = 0;
  let i = 0;
  const n = bytes.length - (bytes.length % 3);
  for (; i < n; i += 3) {
    const v = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out[o++] = B64_CODES[v >>> 18];
    out[o++] = B64_CODES[(v >>> 12) & 63];
    out[o++] = B64_CODES[(v >>> 6) & 63];
    out[o++] = B64_CODES[v & 63];
  }
  const rem = bytes.length - n;
  if (rem) {
    const v = (bytes[i] << 16) | (rem === 2 ? bytes[i + 1] << 8 : 0);
    out[o++] = B64_CODES[v >>> 18];
    out[o++] = B64_CODES[(v >>> 12) & 63];
    out[o++] = rem === 2 ? B64_CODES[(v >>> 6) & 63] : 61;
    out[o++] = 61;
  }
  // ASCII bytes → string in 32 KB chunks (apply() argument-count limit).
  const parts: string[] = [];
  for (let k = 0; k < out.length; k += 0x8000) {
    parts.push(String.fromCharCode.apply(null, out.subarray(k, k + 0x8000) as unknown as number[]));
  }
  return parts.join('');
}

export function base64ToBytes(s: string): Uint8Array {
  if (s.length % 4 !== 0) throw new Error('bad base64');
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((s.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const a = B64_LOOKUP[s.charCodeAt(i)];
    const b = B64_LOOKUP[s.charCodeAt(i + 1)];
    const c = s.charCodeAt(i + 2) === 61 ? 0 : B64_LOOKUP[s.charCodeAt(i + 2)];
    const d = s.charCodeAt(i + 3) === 61 ? 0 : B64_LOOKUP[s.charCodeAt(i + 3)];
    if ((a | b | c | d) < 0) throw new Error('bad base64');
    const v = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < out.length) out[o++] = v >>> 16;
    if (o < out.length) out[o++] = (v >>> 8) & 255;
    if (o < out.length) out[o++] = v & 255;
  }
  return out;
}

const isHex = (s: unknown, bytes?: number): s is string =>
  typeof s === 'string' &&
  s.length > 0 &&
  s.length % 2 === 0 &&
  /^[0-9a-f]+$/i.test(s) &&
  (bytes === undefined || s.length === bytes * 2);

const isBase64 = (s: unknown): s is string =>
  typeof s === 'string' && s.length > 0 && s.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(s);

// Binary fields of the domain types that go into a backup.
const BINARY_FIELDS = ['receiptPhoto', 'coverBytes'] as const;

function encodeBinaryFields<T extends object>(rows: T[]): T[] {
  return rows.map((r) => {
    let copy: Record<string, unknown> | null = null;
    for (const f of BINARY_FIELDS) {
      const v = (r as Record<string, unknown>)[f];
      if (v instanceof Uint8Array) {
        copy ??= { ...(r as Record<string, unknown>) };
        copy[f] = bytesToBase64(v);
      }
    }
    return (copy ?? r) as T;
  });
}

/** v2: base64 string → bytes. v1: {"0":255,"1":216,...} → bytes. */
function reviveBinary(v: unknown): Uint8Array | null {
  if (v == null) return null;
  if (typeof v === 'string') return base64ToBytes(v);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const n = Object.keys(o).length;
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const b = o[i];
      if (typeof b !== 'number') return null;
      out[i] = b;
    }
    return n ? out : null;
  }
  return null;
}

function decodeBinaryFields<T extends object>(rows: T[]): T[] {
  for (const r of rows) {
    const rec = r as Record<string, unknown>;
    for (const f of BINARY_FIELDS) if (f in rec) rec[f] = reviveBinary(rec[f]);
  }
  return rows;
}

export interface BackupManifestInput {
  appVersion: string;
  exportedAt: string;
  trips: Trip[];
  expenses: Expense[];
}

/** Build a v2 envelope. Heavy phases are separated by event-loop yields. */
export async function buildBackupEnvelope(
  manifest: BackupManifestInput,
  passphrase: string,
  progress: BackupProgress = {},
): Promise<string> {
  const lap = (phase: BackupPhase, t0: number) => progress.onPhase?.(phase, now() - t0);
  let t = now();
  const plaintext = utf8ToBytes(
    JSON.stringify({
      schemaVersion: BACKUP_FORMAT_VERSION,
      appVersion: manifest.appVersion,
      exportedAt: manifest.exportedAt,
      trips: encodeBinaryFields(manifest.trips),
      expenses: encodeBinaryFields(manifest.expenses),
    }),
  );
  lap('serialize', t);
  await nextTick();

  const salt = randomBytes(16);
  const nonce = randomBytes(24); // XChaCha20 nonce is 24 bytes
  t = now();
  const key = await deriveKey(passphrase, salt); // once per backup
  lap('kdf', t);

  t = now();
  let ciphertext: Uint8Array;
  try {
    ciphertext = xchacha20poly1305(key, nonce).encrypt(plaintext);
  } finally {
    key.fill(0);
  }
  lap('encrypt', t);
  await nextTick();

  t = now();
  const envelope: BackupEnvelope = {
    v: BACKUP_FORMAT_VERSION,
    kdf: 'argon2id',
    salt: bytesToHex(salt),
    nonce: bytesToHex(nonce),
    enc: 'base64',
    ciphertext: bytesToBase64(ciphertext),
  };
  const out = JSON.stringify(envelope);
  lap('encode', t);
  return out;
}

/**
 * Structural validation of a picked file — needs NO passphrase.
 * Throws InvalidBackupFileError with a user-facing message.
 */
export function parseBackupEnvelope(text: string): BackupEnvelope {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new InvalidBackupFileError('This file is not a 4MyTravels backup (not valid JSON).');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new InvalidBackupFileError('This file is not a 4MyTravels backup.');
  }
  const env = raw as Partial<BackupEnvelope>;
  if (!('ciphertext' in env) || !('kdf' in env) || !('v' in env)) {
    throw new InvalidBackupFileError('This file is not a 4MyTravels backup.');
  }
  if (typeof env.v !== 'number' || !SUPPORTED_VERSIONS.includes(env.v)) {
    throw new InvalidBackupFileError(`Unsupported backup version (v${String(env.v)}). Update the app and try again.`);
  }
  if (env.kdf !== 'argon2id') {
    throw new InvalidBackupFileError('Unsupported backup format.');
  }
  // Poly1305 tag alone is 16 bytes, so a real ciphertext is > 16 bytes.
  const ctOk =
    env.v === 1
      ? isHex(env.ciphertext) && env.ciphertext.length > 32
      : env.enc === 'base64' && isBase64(env.ciphertext) && env.ciphertext.length > 24;
  if (!isHex(env.salt, 16) || !isHex(env.nonce, 24) || !ctOk) {
    throw new InvalidBackupFileError('The backup file is damaged or incomplete.');
  }
  return env as BackupEnvelope;
}

/** Decrypt a validated envelope (v1 or v2). Wrong passphrase → BackupPassphraseError. */
export async function decryptBackup(env: BackupEnvelope, passphrase: string): Promise<RestoreResult> {
  if (!passphrase || passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new BackupPassphraseError(`Passphrase too short (min ${MIN_PASSPHRASE_LENGTH} chars).`);
  }
  const key = await deriveKey(passphrase, hexToBytes(env.salt));
  let plaintext: Uint8Array;
  try {
    const ct = env.v === 1 ? hexToBytes(env.ciphertext) : base64ToBytes(env.ciphertext);
    plaintext = xchacha20poly1305(key, hexToBytes(env.nonce)).decrypt(ct);
  } catch {
    throw new BackupPassphraseError();
  } finally {
    key.fill(0);
  }
  await nextTick();
  let manifest: { schemaVersion?: number; trips?: Trip[]; expenses?: Expense[] };
  try {
    manifest = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    // Authenticated decryption succeeded, so the passphrase was right: the content is bad.
    throw new InvalidBackupFileError('The backup content is damaged.');
  }
  if (typeof manifest.schemaVersion !== 'number' || !SUPPORTED_VERSIONS.includes(manifest.schemaVersion)) {
    throw new InvalidBackupFileError(`Unsupported backup schema v${String(manifest.schemaVersion)}.`);
  }
  let trips: Trip[];
  let expenses: Expense[];
  try {
    trips = decodeBinaryFields(Array.isArray(manifest.trips) ? manifest.trips : []);
    expenses = decodeBinaryFields(Array.isArray(manifest.expenses) ? manifest.expenses : []);
  } catch {
    throw new InvalidBackupFileError('The backup content is damaged.');
  }
  return { trips, expenses };
}
