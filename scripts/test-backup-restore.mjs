#!/usr/bin/env node
// Regression test for the backup restore flow (src/db/backupFormat.ts).
//
// Restore order is: choose file → validate (parseBackupEnvelope, NO passphrase)
// → passphrase → decryptBackup. Cases covered:
//   - valid backup round-trips (existing envelope format unchanged)
//   - invalid files are rejected BEFORE any passphrase is needed
//   - wrong passphrase → BackupPassphraseError and the parsed envelope can be
//     retried with the right passphrase (file selection kept)
//   - cancel is UI-only (picker returns canceled) — see manual notes in CHANGELOG.
//
// Gebruik:  node scripts/test-backup-restore.mjs

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();
const tsc = join(root, 'node_modules', '.bin', 'tsc');

let failed = 0;
function assert(cond, msg) {
  if (cond) console.log('PASS:', msg);
  else { console.error('FAIL:', msg); failed++; }
}
async function throwsName(fn, name) {
  try { await fn(); return false; } catch (e) { return e?.name === name; }
}

const cache = mkdtempSync(join(tmpdir(), '4mt-backup-'));
try {
  try { symlinkSync(join(root, 'node_modules'), join(cache, 'node_modules'), 'dir'); } catch { /* best effort */ }
  execFileSync(tsc, [
    '--ignoreConfig', '--module', 'commonjs', '--target', 'es2020', '--moduleResolution', 'bundler',
    '--esModuleInterop', '--skipLibCheck', '--ignoreDeprecations', '6.0',
    '--rootDir', 'src', '--outDir', cache, 'src/db/backupFormat.ts',
  ], { cwd: root, stdio: 'pipe' });
} catch (e) {
  console.error('Kon backupFormat niet compileren:', e.stdout?.toString(), e.stderr?.toString() ?? e.message);
  process.exit(1);
}

try {
  const b = require(join(cache, 'db', 'backupFormat.js'));
  const PASS = 'correct horse battery';
  const manifest = {
    schemaVersion: b.BACKUP_FORMAT_VERSION, appVersion: '1.0.0', exportedAt: '2026-11-16T00:00:00Z',
    trips: [{ id: 't1', name: 'Japan' }], expenses: [{ id: 'e1', tripId: 't1', amount: 12 }],
  };
  const file = await b.buildBackupEnvelope(manifest, PASS);

  // valid
  const env = b.parseBackupEnvelope(file);
  assert(env.v === b.BACKUP_FORMAT_VERSION && env.kdf === 'argon2id', 'valid: file validates without passphrase');
  const res = await b.decryptBackup(env, PASS);
  assert(res.trips.length === 1 && res.expenses.length === 1 && res.trips[0].name === 'Japan', 'valid: round-trip restores data');

  // invalid files — rejected at validate step (no passphrase involved)
  const bad = {
    'not JSON': 'hello,world\n1,2',
    'JSON array': '[]',
    'other JSON': JSON.stringify({ trips: [] }),
    'future version': JSON.stringify({ ...JSON.parse(file), v: 99 }),
    'other kdf': JSON.stringify({ ...JSON.parse(file), kdf: 'pbkdf2' }),
    'bad salt': JSON.stringify({ ...JSON.parse(file), salt: 'zz' }),
    'truncated ciphertext': JSON.stringify({ ...JSON.parse(file), ciphertext: 'abcd' }),
    'v2 non-base64 ciphertext': JSON.stringify({ ...JSON.parse(file), ciphertext: 'ab'.repeat(40) + '!' }),
  };
  for (const [label, text] of Object.entries(bad)) {
    assert(await throwsName(() => b.parseBackupEnvelope(text), 'InvalidBackupFileError'), `invalid: ${label} → InvalidBackupFileError`);
  }

  // wrong passphrase → retryable, same envelope then succeeds
  assert(await throwsName(() => b.decryptBackup(env, 'wrong passphrase'), 'BackupPassphraseError'), 'wrong passphrase: BackupPassphraseError');
  assert(await throwsName(() => b.decryptBackup(env, 'short'), 'BackupPassphraseError'), 'too-short passphrase: BackupPassphraseError');
  assert((await b.decryptBackup(env, PASS)).trips.length === 1, 'wrong passphrase: retry on kept envelope succeeds');

  // tampered ciphertext (valid structure) is indistinguishable from a wrong key → retryable error
  const c = JSON.parse(file).ciphertext;
  const tampered = b.parseBackupEnvelope(JSON.stringify({ ...JSON.parse(file), ciphertext: (c[0] === 'A' ? 'B' : 'A') + c.slice(1) }));
  assert(await throwsName(() => b.decryptBackup(tampered, PASS), 'BackupPassphraseError'), 'tampered: auth tag rejects');
} finally {
  rmSync(cache, { recursive: true, force: true });
}

if (failed) { console.error(`\n${failed} test(s) failed`); process.exit(1); }
console.log('\nAll backup-restore tests passed');
