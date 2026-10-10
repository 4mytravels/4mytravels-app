#!/usr/bin/env node
// Regression test for the trip cover photo (tripRepo.updateTrip).
//
// Uses a FAKE StorageAdapter that records the SQL + params it receives, so it
// needs no native module, no WASM engine and no DB — it asserts the exact SQL
// semantics that used to be wrong.
//
// Background (bug, 2026-10-03): updateTrip used
//   cover_photo = COALESCE(?, cover_photo)
// so passing null to REMOVE a photo was a silent no-op, and the edit screen
// offered no way to change an existing photo. Contract now:
//   undefined -> keep the existing blob
//   null      -> clear it
//   bytes     -> replace it
//
// Gebruik:  node scripts/test-trip-cover.mjs

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

const cache = mkdtempSync(join(tmpdir(), '4mt-cover-'));
try {
  try { symlinkSync(join(root, 'node_modules'), join(cache, 'node_modules'), 'dir'); } catch { /* best effort */ }
  execFileSync(tsc, [
    '--ignoreConfig',
    '--module', 'commonjs',
    '--target', 'es2020',
    '--moduleResolution', 'node',
    '--esModuleInterop',
    '--skipLibCheck',
    '--ignoreDeprecations', '6.0',
    '--outDir', cache,
    'src/db/types.ts',
    'src/db/index.ts',
    'src/db/tripRepo.ts',
  ], { cwd: root, stdio: 'pipe' });
} catch (e) {
  console.error('Kon tripRepo niet compileren:', e.stderr?.toString() ?? e.message);
  process.exit(1);
}

const { updateTrip } = require(join(cache, 'db', 'tripRepo.js'));

/** Records every exec() call; query() is never used by updateTrip. */
const recording = {
  calls: [],
  async exec(sql, params) { this.calls.push({ sql, params }); },
  async query() { return []; },
  async compact() {},
  async init() {},
  async close() {},
  isEncrypted() { return true; },
};

const trip = {
  id: 'trip-1',
  name: 'Japan',
  startDate: '2026-09-01',
  endDate: '2026-09-10',
  homeCurrency: 'EUR',
  defaultCurrency: 'JPY',
  dailyBudget: 100,
  countries: ['JP'],
};
const photoA = new Uint8Array([1, 2, 3]);
const photoB = new Uint8Array([7, 7, 7, 7]);

(async () => {
  // 1. Keep existing: undefined must NOT bind a photo parameter at all, and
  //    the SQL must assign the column to itself.
  await updateTrip(trip, undefined, recording);
  let call = recording.calls.at(-1);
  assert(/cover_photo\s*=\s*cover_photo/.test(call.sql), 'undefined -> cover_photo = cover_photo');
  assert(call.params.length === 8, 'undefined bindt geen foto-parameter (params=' + call.params.length + ')');
  assert(call.params.at(-1) === 'trip-1', 'WHERE-parameter blijft als laatste (id)');

  // 2. Replace: the blob is bound as a parameter.
  await updateTrip(trip, photoA, recording);
  call = recording.calls.at(-1);
  assert(/cover_photo\s*=\s*\?/.test(call.sql), 'bytes -> cover_photo = ?');
  assert(call.params.length === 9, 'bytes bindt een foto-parameter (params=' + call.params.length + ')');
  assert(call.params[7] instanceof Uint8Array, 'gebonden foto is een Uint8Array');

  // 3. Clear: null must be bound so SQLite actually NULLs the column. This is
  //    the assertion the old COALESCE version could never pass.
  await updateTrip(trip, null, recording);
  call = recording.calls.at(-1);
  assert(/cover_photo\s*=\s*\?/.test(call.sql), 'null -> cover_photo = ? (geen COALESCE)');
  assert(!/COALESCE/i.test(call.sql), 'geen COALESCE meer in de UPDATE');
  assert(call.params.length === 9, 'null bindt een parameter (params=' + call.params.length + ')');
  assert(call.params[7] === null, 'gebonden waarde is null -> kolom wordt geleegd');

  // 4. Photo B after photo A must be a plain replace, never a merge.
  await updateTrip(trip, photoB, recording);
  call = recording.calls.at(-1);
  assert(call.params[7] instanceof Uint8Array && call.params[7].length === 4,
    'tweede foto wordt volledig vervangen (niet gemerged)');

  rmSync(cache, { recursive: true, force: true });
  console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILURE(S)`);
  process.exit(failed === 0 ? 0 : 1);
})();