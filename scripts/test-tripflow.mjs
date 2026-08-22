#!/usr/bin/env node
// Standalone trip-flow test for 4MyTravels.
// Draait onder Node tegen de WebStorageAdapter (in-memory) — geen extra deps
// nodig behalve de repo's eigen `tsc` + `uuid`. Compileert de web-stack tijdelijk
// naar .cache/, draait de checks, ruimt daarna op.
//
// Gebruik:  node scripts/test-tripflow.mjs
//
// Bewijst (tegen de storage-interface die native + web delen):
//   1. init() idempotent (tweemaal aanroepen hangt niet)
//   2. concurrent dubbele init() hangt niet (de oorspronkelijke create-trip bug)
//   3. saveTrip(create) + loadTrips() round-trip (naam/startDate/budget/currency)
//   4. updateTrip(edit) zonder duplicate + velden bijgewerkt
//   5. getStorageAdapter().loadTrips() levert een array
//
// Let op: dit test de WEB-adapter (in-memory JS). De native op-sqlite/SQLCipher
// adapter (device) gebruikt echte SQL en deelt dezelfde tripRepo-mapping; een
// echte device-test blijft nodig voor SQLCipher/Keystore-verificatie.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();
const tsc = join(root, 'node_modules', '.bin', 'tsc');

let failed = 0;
function assert(cond, msg) {
  if (cond) {
    console.log('PASS:', msg);
  } else {
    console.error('FAIL:', msg);
    failed++;
  }
}

// 1. Compileer web-stack naar tijdelijke cache
const cache = mkdtempSync(join(tmpdir(), '4mt-test-'));
try {
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
    'src/db/migrations.ts',
    'src/db/storage.web.ts',
    'src/db/index.ts',
    'src/db/tripRepo.ts',
  ], { cwd: root, stdio: 'pipe' });
} catch (e) {
  console.error('Kon web-stack niet compileren:', e.stderr?.toString() ?? e.message);
  process.exit(1);
}

// 2. Laad de gecompileerde modules
const { WebStorageAdapter } = require(join(cache, 'db', 'storage.web.js'));
const { getStorageAdapter } = require(join(cache, 'db', 'index.js'));
const { saveTrip, loadTrips, updateTrip } = require(join(cache, 'db', 'tripRepo.js'));
const { v4: uuid } = require('uuid');

(async () => {
  const db = new WebStorageAdapter();

  await db.init({});
  await db.init({});
  assert(true, 'init() tweemaal zonder hang/crash');

  const db2 = new WebStorageAdapter();
  let hung = false;
  try {
    await Promise.race([
      Promise.all([db2.init({}), db2.init({})]),
      new Promise((_, rej) => setTimeout(() => { hung = true; rej(new Error('HANG')); }, 3000)),
    ]);
    assert(!hung, 'concurrent dubbele init() hangt niet');
  } catch (e) {
    assert(false, 'concurrent dubbele init: ' + e.message);
  }

  const trip = {
    id: uuid(),
    name: 'Japan in autumn',
    startDate: '2026-10-01',
    endDate: '2026-10-14',
    homeCurrency: 'EUR',
    defaultCurrency: 'JPY',
    dailyBudget: 75.5,
  };
  await saveTrip(trip, db);
  const trips = await loadTrips(db);
  assert(trips.length === 1, 'exact 1 trip opgeslagen (got ' + trips.length + ')');
  const back = trips[0];
  assert(back.name === 'Japan in autumn', 'naam round-trip correct');
  assert(back.startDate === '2026-10-01', 'startDate round-trip correct');
  assert(back.dailyBudget === 75.5, 'dailyBudget round-trip correct (got ' + back.dailyBudget + ')');
  assert(back.defaultCurrency === 'JPY', 'defaultCurrency round-trip correct');

  const edited = { ...trip, name: 'Japan Autumn Trip', dailyBudget: 80 };
  await updateTrip(edited, db);
  const trips2 = await loadTrips(db);
  assert(trips2.length === 1, 'edit voegt geen duplicate toe (got ' + trips2.length + ')');
  assert(trips2[0].name === 'Japan Autumn Trip', 'edit naam bijgewerkt');
  assert(trips2[0].dailyBudget === 80, 'edit budget bijgewerkt (got ' + trips2[0].dailyBudget + ')');

  const dbDef = getStorageAdapter();
  await dbDef.init({});
  const tripsDef = await loadTrips(dbDef);
  assert(Array.isArray(tripsDef), 'getStorageAdapter().loadTrips() levert array');

  console.log('\n=== TRIP-FLOW TEST VOLTOOID ===');
  if (failed > 0) {
    console.error(failed + ' check(s) FAILED');
    process.exitCode = 1;
  } else {
    console.log('Alle checks PASS');
  }
})().finally(() => {
  rmSync(cache, { recursive: true, force: true });
});
