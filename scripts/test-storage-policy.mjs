#!/usr/bin/env node
// M7 regression: secure_delete + incremental auto_vacuum (decision V3).
//
// Runs the REAL policy (src/db/storagePolicy.ts) against a REAL SQLite file
// (node:sqlite) — plaintext SQLite, so a hexdump-style byte search can prove
// that deleted rows are gone from the file pages. (SQLCipher encrypts the
// pages on device; the erasure semantics of secure_delete are identical.)
//
//  1. A legacy DB (auto_vacuum = NONE, as every existing install has) is
//     migrated once: mode becomes INCREMENTAL, a second open does not VACUUM.
//  2. Deleting a trip with 2 000 expenses + reclaimFreePages() leaves no
//     recoverable text in the file, and takes < 500 ms.
//  3. Control: the same delete WITHOUT the policy leaves the text in the file
//     (proves the byte search can actually see leftovers).
//  4. The web worker mirrors the same sequence.
//
// Gebruik:  node scripts/test-storage-policy.mjs

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

process.removeAllListeners('warning'); // node:sqlite ExperimentalWarning
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const root = process.cwd();
const tsc = join(root, 'node_modules', '.bin', 'tsc');

let failed = 0;
function assert(cond, msg) {
  if (cond) console.log('PASS:', msg);
  else { console.error('FAIL:', msg); failed++; }
}

const cache = mkdtempSync(join(tmpdir(), '4mt-policy-'));
try {
  try { symlinkSync(join(root, 'node_modules'), join(cache, 'node_modules'), 'dir'); } catch { /* best effort */ }
  execFileSync(tsc, [
    '--ignoreConfig', '--module', 'commonjs', '--target', 'es2020',
    '--moduleResolution', 'node', '--esModuleInterop', '--skipLibCheck',
    '--ignoreDeprecations', '6.0', '--outDir', cache, 'src/db/storagePolicy.ts',
  ], { cwd: root, stdio: 'pipe' });
} catch (e) {
  console.error('Kon storagePolicy niet compileren:', e.stderr?.toString() ?? e.message);
  process.exit(1);
}
const { applyStoragePolicy, reclaimFreePages, AUTO_VACUUM_INCREMENTAL } = require(join(cache, 'storagePolicy.js'));

// Same shape the adapters hand in: async exec + async query → rows.
const adapter = (db) => ({
  exec: async (sql) => { db.exec(sql); },
  query: async (sql) => db.prepare(sql).all(),
});

function seedLegacy(file) {
  const db = new DatabaseSync(file);
  // No auto_vacuum pragma → NONE (0), exactly like an existing install.
  db.exec(`CREATE TABLE trips (id TEXT PRIMARY KEY, name TEXT);
           CREATE TABLE expenses (id TEXT PRIMARY KEY, trip_id TEXT, notes TEXT, receipt_photo BLOB);`);
  db.exec("INSERT INTO trips VALUES ('t1', 'SECRET-TRIP-NAME'), ('t2', 'KEEP-TRIP')");
  const ins = db.prepare('INSERT INTO expenses VALUES (?, ?, ?, ?)');
  db.exec('BEGIN');
  for (let i = 0; i < 2000; i++) ins.run('e' + i, 't1', 'PLAINTEXT-MARKER-' + i, Buffer.alloc(512, 0x41));
  ins.run('k1', 't2', 'KEEP-MARKER', null);
  db.exec('COMMIT');
  return db;
}

const deleteTrip = (db, id) => {
  db.exec(`DELETE FROM expenses WHERE trip_id = '${id}'`);
  db.exec(`DELETE FROM trips WHERE id = '${id}'`);
};

try {
  // ---- 1. migration ----
  const file = join(cache, 'policy.db');
  let db = seedLegacy(file);
  assert(db.prepare('PRAGMA auto_vacuum').get().auto_vacuum === 0, 'legacy DB starts with auto_vacuum = NONE');
  let a = adapter(db);
  const first = await applyStoragePolicy(a.exec, a.query);
  assert(first.migrated === true, 'first open migrates (one VACUUM)');
  assert(db.prepare('PRAGMA auto_vacuum').get().auto_vacuum === AUTO_VACUUM_INCREMENTAL, 'auto_vacuum = INCREMENTAL after migration');
  assert(db.prepare('PRAGMA secure_delete').get().secure_delete === 1, 'secure_delete = ON on this connection');
  db.close();

  db = new DatabaseSync(file);
  a = adapter(db);
  assert(db.prepare('PRAGMA secure_delete').get().secure_delete === 0, 'secure_delete is per connection (off on a fresh connection)');
  const second = await applyStoragePolicy(a.exec, a.query);
  assert(second.migrated === false, 'second open does NOT VACUUM again');
  assert(db.prepare('PRAGMA secure_delete').get().secure_delete === 1, 'secure_delete re-applied on every open');
  assert(db.prepare('SELECT count(*) AS n FROM expenses').get().n === 2001, 'migration kept every row');

  // ---- 2. erasure + timing ----
  const t0 = performance.now();
  deleteTrip(db, 't1');
  await reclaimFreePages(a.exec);
  const ms = performance.now() - t0;
  assert(ms < 500, `delete trip with 2 000 expenses + reclaim < 500 ms (${ms.toFixed(1)} ms)`);
  assert(db.prepare('PRAGMA freelist_count').get().freelist_count === 0, 'no free pages left after incremental_vacuum');
  db.close();
  const bytes = readFileSync(file).toString('latin1');
  assert(!bytes.includes('PLAINTEXT-MARKER'), 'deleted expense text is not in the file');
  assert(!bytes.includes('SECRET-TRIP-NAME'), 'deleted trip name is not in the file');
  assert(bytes.includes('KEEP-MARKER') && bytes.includes('KEEP-TRIP'), 'surviving rows are still there');

  // ---- 3. control: no policy → leftovers are visible ----
  const ctl = join(cache, 'control.db');
  const c = seedLegacy(ctl);
  deleteTrip(c, 't1');
  c.close();
  assert(readFileSync(ctl).toString('latin1').includes('PLAINTEXT-MARKER'), 'control: without the policy deleted text DOES linger (test is sensitive)');

  // ---- 4. worker mirror ----
  const w = readFileSync(join(root, 'public/sqlite-worker.js'), 'utf8');
  const fn = w.slice(w.indexOf('function applyStoragePolicy'), w.indexOf('function exportDbBytes'));
  assert(/secure_delete = ON/.test(fn) && /auto_vacuum = INCREMENTAL/.test(fn) && /VACUUM;/.test(fn) && /mode === 2/.test(fn), 'worker applyStoragePolicy mirrors the TS sequence');
  assert((w.match(/applyStoragePolicy\(\)/g) ?? []).length >= 4, 'worker applies the policy on every open/import path (sahpool, idb, import×2)');
  const compact = w.slice(w.indexOf('async function opCompact'), w.indexOf('async function opClose'));
  assert(/incremental_vacuum/.test(compact) && !/'VACUUM;'/.test(compact), 'worker compact uses incremental_vacuum, not a full VACUUM');
  const nat = readFileSync(join(root, 'src/db/storage.native.ts'), 'utf8');
  assert(nat.indexOf('applyStoragePolicy(') > 0 && nat.indexOf('applyStoragePolicy(') < nat.indexOf('await this.runSchema()'), 'native applies the policy before migrations');
} finally {
  rmSync(cache, { recursive: true, force: true });
}

console.log(failed ? `\n${failed} failure(s)` : '\nall storage-policy checks passed');
process.exit(failed ? 1 : 0);
