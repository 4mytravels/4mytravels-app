// Encrypted local backup / restore (MVP scope §2.2).
//
// Design (privacy-first, FLOSS, no native deps so it works on both Android and
// the PWA):
//   - Key derived from the user's passphrase via Argon2id (same model as the
//     planned PWA live DB key — §2.2). The device key (Keystore) is NEVER used
//     here, so the backup is portable across devices. Parameters: see
//     ARGON2_PARAMS in ./backupFormat.ts (64 MiB, t=3, p=1 — not lowered).
//   - Payload encrypted with XChaCha20-Poly1305 (nonce + auth tag).
//   - Format: { v, kdf, salt, nonce, enc, ciphertext } — a single
//     self-describing JSON envelope. The schema version + app version live in
//     the plaintext manifest inside the ciphertext so restore can validate
//     compatibility. v2 = base64 binary fields + base64 ciphertext; v1 files
//     still restore (see FORMAT VERSIONS in ./backupFormat.ts).
//   - The pure format code (build / validate / decrypt) lives in
//     ./backupFormat.ts so it is unit-testable without the storage layer.
//
// NOTE: the scope mentions a zip container; a single encrypted JSON envelope is
// used instead to avoid a native zip dependency while keeping the same security
// and portability properties. Can be wrapped in zip later without API change.

import { loadTrips } from './tripRepo';
import { loadExpenses } from './expenseRepo';
import { getStorageAdapter } from './index';
import type { StorageAdapter } from './types';
import {
  buildBackupEnvelope,
  parseBackupEnvelope,
  decryptBackup,
  type BackupProgress,
  type RestoreResult,
} from './backupFormat';

export {
  BACKUP_FORMAT_VERSION,
  ARGON2_PARAMS,
  MIN_PASSPHRASE_LENGTH,
  parseBackupEnvelope,
  decryptBackup,
  InvalidBackupFileError,
  BackupPassphraseError,
  type BackupEnvelope,
  type BackupPhase,
  type BackupProgress,
  type RestoreResult,
} from './backupFormat';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// Two queries in total (trips, expenses incl. receipt BLOBs) — no per-row N+1.
export async function createBackup(
  passphrase: string,
  db: StorageAdapter = getStorageAdapter(),
  progress: BackupProgress = {},
): Promise<string> {
  const t0 = now();
  const [trips, expenses] = await Promise.all([loadTrips(db), loadExpenses(undefined, db)]);
  progress.onPhase?.('collect', now() - t0);
  return buildBackupEnvelope(
    { appVersion: '1.0.0', exportedAt: new Date().toISOString(), trips, expenses },
    passphrase,
    progress,
  );
}

/** One-shot validate + decrypt (for callers that already have both inputs). */
export async function restoreBackup(envelopeJson: string, passphrase: string): Promise<RestoreResult> {
  return decryptBackup(parseBackupEnvelope(envelopeJson), passphrase);
}
