#!/usr/bin/env node
// Backup create -> restore round-trip + per-phase timing.
//
// WHY THIS EXISTS
// createBackup() was slow and silently corrupted photos: JSON.stringify on a
// Uint8Array yields {"0":255,"1":216,...} (~5-6 chars per byte), and restore
// handed those plain objects to saveExpense/saveTrip. Format v2 encodes binary
// fields as base64 and the envelope ciphertext as base64. This test pins:
//   - v2 round-trip restores byte-identical receipt + cover photos
//   - v1 backups (hex envelope, numeric-key byte objects) still restore
//   - wrong passphrase fails
//   - Argon2id parameters are not weakened
//
// Gebruik:  node scripts/test-backup-roundtrip.mjs [--bench]
//   --bench  realistic dataset (300 expenses, 100 receipts @ 350 KB, 10 covers)

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();
const tsc = join(root, 'node_modules', '.bin', 'tsc');
const BENCH = process.argv.includes('--bench');

let failed = 0;
function assert(cond, msg) {
  if (cond) console.log('PASS:', msg);
  else {
    console.error('FAIL:', msg);
    failed++;
  }
}

const cache = mkdtempSync(join(tmpdir(), '4mt-backup-'));
try {
  try {
    symlinkSync(join(root, 'node_modules'), join(cache, 'node_modules'), 'dir');
  } catch {
    /* best effort */
  }
  execFileSync(
    tsc,
    [
      '--ignoreConfig', '--module', 'commonjs', '--target', 'es2020', '--moduleResolution', 'bundler',
      '--esModuleInterop', '--skipLibCheck', '--ignoreDeprecations', '6.0', '--rootDir', 'src', '--outDir', cache,
      'src/db/backup.ts',
    ],
    { cwd: root, stdio: 'pipe' },
  );
} catch (e) {
  console.error('Kon backup.ts niet compileren:', e.stdout?.toString() ?? '', e.stderr?.toString() ?? e.message);
  process.exit(1);
}

const backup = require(join(cache, 'db', 'backup.js'));
const { createBackup, restoreBackup, ARGON2_PARAMS, BACKUP_FORMAT_VERSION } = backup;
const { argon2id } = require('@noble/hashes/argon2.js');
const { randomBytes, bytesToHex, utf8ToBytes } = require('@noble/hashes/utils.js');
const { xchacha20poly1305 } = require('@noble/ciphers/chacha.js');

function photo(n, seed) {
  const b = new Uint8Array(n);
  let x = seed * 2654435761 >>> 0;
  for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) >>> 0; b[i] = x >>> 24; }
  return b;
}

function dataset(nExp, nReceipts, receiptSize, nTrips, coverSize) {
  const trip_rows = [];
  for (let i = 0; i < nTrips; i++) {
    trip_rows.push({
      id: `t${i}`, name: `Trip ${i}`, home_currency: 'EUR', start_date: '2026-01-01', end_date: '2026-01-10',
      daily_budget: 50, cover_photo: i < 10 ? photo(coverSize, 1000 + i) : null, created_at: '2026-01-01',
    });
  }
  const exp_rows = [];
  for (let i = 0; i < nExp; i++) {
    exp_rows.push({
      id: `e${i}`, trip_id: `t${i % nTrips}`, amount: 12.5 + i, currency: 'EUR', rate_to_home: 1,
      rate_date: '2026-01-02', category: 'Food', created_at: '2026-01-02T12:00:00.000Z', country: 'NL',
      location: 'Amsterdam', payment_method: 'card', notes: 'lunch ' + i,
      receipt_photo: i < nReceipts ? photo(receiptSize, i + 1) : null,
      multi_day_split_start: null, multi_day_split_end: null,
    });
  }
  return { trip_rows, exp_rows };
}

function fakeAdapter({ trip_rows, exp_rows }) {
  return {
    async query(sql) {
      if (/FROM trips/i.test(sql)) return trip_rows;
      if (/FROM expenses/i.test(sql)) return exp_rows;
      return [];
    },
  };
}

const eqBytes = (a, b) => a instanceof Uint8Array && b instanceof Uint8Array && a.length === b.length && a.every((v, i) => v === b[i]);
const PASS = 'correct horse battery';

console.log('=== Argon2id parameters are not weakened ===');
assert(ARGON2_PARAMS.m >= 64 * 1024 && ARGON2_PARAMS.t >= 3 && ARGON2_PARAMS.dkLen === 32, 'm>=64MiB, t>=3, 256-bit key');
assert(BACKUP_FORMAT_VERSION === 2, 'format version bumped to 2');

console.log('=== v2 round-trip keeps photos byte-identical ===');
{
  const ds = dataset(20, 5, 4096, 3, 2048);
  const phases = {};
  const env = await createBackup(PASS, fakeAdapter(ds), { onPhase: (p, ms) => (phases[p] = ms) });
  const parsed = JSON.parse(env);
  assert(parsed.v === 2 && parsed.enc === 'base64', 'envelope v2 with base64 ciphertext');
  assert(['collect', 'serialize', 'kdf', 'encrypt', 'encode'].every((p) => typeof phases[p] === 'number'), 'per-phase timings reported');
  const r = await restoreBackup(env, PASS);
  assert(r.trips.length === 3 && r.expenses.length === 20, 'counts restored');
  assert(eqBytes(r.expenses[0].receiptPhoto, ds.exp_rows[0].receipt_photo), 'receipt restored as identical Uint8Array');
  assert(r.expenses[10].receiptPhoto == null, 'expense without receipt stays null');
  assert(eqBytes(r.trips[0].coverBytes, ds.trip_rows[0].cover_photo), 'trip cover restored as identical Uint8Array');
  let threw = false;
  try { await restoreBackup(env, 'wrong passphrase!'); } catch { threw = true; }
  assert(threw, 'wrong passphrase rejected');
}

console.log('=== v1 (pre-change) backups still restore ===');
{
  // Build exactly what the old createBackup produced.
  const rec = new Uint8Array([255, 216, 1, 2, 3]);
  const cover = new Uint8Array([9, 8, 7]);
  const manifest = {
    schemaVersion: 1, appVersion: '1.0.0', exportedAt: '2026-01-01T00:00:00.000Z',
    trips: [{ id: 't0', name: 'Old', coverBytes: cover }],
    expenses: [{ id: 'e0', tripId: 't0', amount: 1, receiptPhoto: rec }, { id: 'e1', tripId: 't0', amount: 2, receiptPhoto: null }],
  };
  const salt = randomBytes(16);
  const nonce = randomBytes(24);
  const key = argon2id(utf8ToBytes(PASS), salt, { t: 3, m: 64 * 1024, p: 1, dkLen: 32, version: 0x13 });
  const ct = xchacha20poly1305(key, nonce).encrypt(utf8ToBytes(JSON.stringify(manifest)));
  const env = JSON.stringify({ v: 1, kdf: 'argon2id', salt: bytesToHex(salt), nonce: bytesToHex(nonce), ciphertext: bytesToHex(ct) });
  const r = await restoreBackup(env, PASS);
  assert(r.trips.length === 1 && r.expenses.length === 2, 'v1 counts restored');
  assert(eqBytes(r.expenses[0].receiptPhoto, rec), 'v1 receipt (numeric-key object) revived to Uint8Array');
  assert(r.expenses[1].receiptPhoto == null, 'v1 null receipt stays null');
  assert(eqBytes(r.trips[0].coverBytes, cover), 'v1 cover revived to Uint8Array');
}

if (BENCH) {
  const R = +(process.env.BENCH_RECEIPTS ?? 100);
  const C = +(process.env.BENCH_COVERS ?? 10);
  console.log(`=== bench: 300 expenses, ${R} receipts @ 350 KB, ${C} covers @ 200 KB ===`);
  const ds = dataset(300, R, 350 * 1024, 20, 200 * 1024);
  ds.trip_rows.forEach((t, i) => { if (i >= C) t.cover_photo = null; });
  const phases = {};
  const t0 = performance.now();
  const env = await createBackup(PASS, fakeAdapter(ds), { onPhase: (p, ms) => (phases[p] = ms) });
  const total = performance.now() - t0;
  console.log('phases (ms):', Object.fromEntries(Object.entries(phases).map(([k, v]) => [k, Math.round(v)])));
  console.log(`create total: ${Math.round(total)} ms, file size: ${(env.length / 1048576).toFixed(1)} MB`);
  const t1 = performance.now();
  const r = await restoreBackup(env, PASS);
  console.log(`restore total: ${Math.round(performance.now() - t1)} ms`);
  assert(eqBytes(r.expenses[99].receiptPhoto, ds.exp_rows[99].receipt_photo), 'bench receipt intact');
}

rmSync(cache, { recursive: true, force: true });
if (failed) {
  console.error(`\n${failed} test(s) FAILED`);
  process.exit(1);
}
console.log('\nAll backup tests passed.');
