#!/usr/bin/env node
// Standalone trip-flow + expense-flow test for 4MyTravels.
// Draait onder Node tegen de WebStorageAdapter (in-memory) — geen extra deps
// nodig behalve de repo's eigen `tsc` + `uuid`. Compileert de web-stack tijdelijk
// naar een temp-dir, draait de checks, ruimt daarna op.
//
// Gebruik:  node scripts/test-tripflow.mjs
//
// Bewijst (tegen de storage-interface die native + web delen):
//   Trip-flow:
//   1. init() idempotent (tweemaal aanroepen hangt niet)
//   2. concurrent dubbele init() hangt niet (de oorspronkelijke create-trip bug)
//   3. saveTrip(create) + loadTrips() round-trip (naam/startDate/budget/currency)
//   4. updateTrip(edit) zonder duplicate + velden bijgewerkt
//   5. getStorageAdapter().loadTrips() levert een array
//   Expense-flow:
//   6. saveExpense(create) + loadExpenses(tripId) round-trip (bedrag/valuta/cat/rate)
//   7. saveExpense met zelfde id = INSERT OR REPLACE (upsert, geen duplicate)
//   8. deleteExpense verwijdert de row
//   9. expense met receiptPhoto (Uint8Array) + multiDaySplit round-trip
//
// Let op: dit test de WEB-adapter (in-memory JS). De native op-sqlite/SQLCipher
// adapter (device) gebruikt echte SQL en deelt dezelfde repo-mapping; een
// echte device-test blijft nodig voor SQLCipher/Keystore-verificatie.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
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
    'src/db/expenseRepo.ts',
  ], { cwd: root, stdio: 'pipe' });
} catch (e) {
  console.error('Kon web-stack niet compileren:', e.stderr?.toString() ?? e.message);
  process.exit(1);
}

// 2. Laad de gecompileerde modules
const { WebStorageAdapter } = require(join(cache, 'db', 'storage.web.js'));
const { getStorageAdapter } = require(join(cache, 'db', 'index.js'));
const { saveTrip, loadTrips, updateTrip } = require(join(cache, 'db', 'tripRepo.js'));
const { saveExpense, loadExpenses, deleteExpense } = require(join(cache, 'db', 'expenseRepo.js'));
const { v4: uuid } = require('uuid');

(async () => {
  const db = new WebStorageAdapter();

  // ---- Trip-flow ----
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

  // ---- Expense-flow ----
  const tripId = trip.id;
  const expense = {
    id: uuid(),
    tripId,
    amount: 120.5,
    currency: 'JPY',
    rateToHome: 0.0062,
    rateDate: '2026-10-02',
    category: 'Food',
    createdAt: '2026-10-02T19:30:00+09:00',
    country: 'JP',
    location: 'Tokyo',
    paymentMethod: 'card',
    notes: 'Ramen dinner',
  };
  await saveExpense(expense, db);
  const exp = await loadExpenses(tripId, db);
  assert(exp.length === 1, 'exact 1 expense opgeslagen (got ' + exp.length + ')');
  const eb = exp[0];
  assert(eb.amount === 120.5, 'expense amount round-trip correct (got ' + eb.amount + ')');
  assert(eb.currency === 'JPY', 'expense currency round-trip correct');
  assert(eb.category === 'Food', 'expense category round-trip correct');
  assert(eb.rateToHome === 0.0062, 'expense rateToHome round-trip correct (got ' + eb.rateToHome + ')');
  assert(eb.paymentMethod === 'card', 'expense paymentMethod round-trip correct');
  assert(eb.notes === 'Ramen dinner', 'expense notes round-trip correct');

  // upsert: zelfde id, andere waarden → geen duplicate, wel update
  const upserted = { ...expense, amount: 200, category: 'Drinks' };
  await saveExpense(upserted, db);
  const exp2 = await loadExpenses(tripId, db);
  assert(exp2.length === 1, 'upsert voegt geen duplicate toe (got ' + exp2.length + ')');
  assert(exp2[0].amount === 200, 'upsert amount bijgewerkt (got ' + exp2[0].amount + ')');
  assert(exp2[0].category === 'Drinks', 'upsert category bijgewerkt');

  // delete
  await deleteExpense(expense.id, db);
  const exp3 = await loadExpenses(tripId, db);
  assert(exp3.length === 0, 'deleteExpense verwijdert de row (got ' + exp3.length + ')');

  // edge: receiptPhoto (Uint8Array) + multiDaySplit round-trip
  const photo = new Uint8Array([1, 2, 3, 4, 5]);
  const edge = {
    id: uuid(),
    tripId,
    amount: 50,
    currency: 'EUR',
    rateToHome: 1,
    rateDate: '2026-10-03',
    category: 'Accommodation',
    createdAt: '2026-10-03T12:00:00+09:00',
    paymentMethod: 'cash',
    receiptPhoto: photo,
    multiDaySplit: { splitStart: '2026-10-03', splitEnd: '2026-10-05' },
  };
  await saveExpense(edge, db);
  const expEdge = await loadExpenses(tripId, db);
  assert(expEdge.length === 1, 'edge-expense opgeslagen (got ' + expEdge.length + ')');
  const eeb = expEdge[0];
  assert(eeb.receiptPhoto !== null && eeb.receiptPhoto !== undefined, 'receiptPhoto niet verloren');
  assert(Array.isArray(eeb.receiptPhoto) || eeb.receiptPhoto instanceof Uint8Array, 'receiptPhoto is array-achtig');
  assert(eeb.multiDaySplit?.splitStart === '2026-10-03', 'multiDaySplit.splitStart round-trip');
  assert(eeb.multiDaySplit?.splitEnd === '2026-10-05', 'multiDaySplit.splitEnd round-trip');

  console.log('\n=== TRIP + EXPENSE FLOW TEST VOLTOOID ===');
  if (failed > 0) {
    console.error(failed + ' check(s) FAILED');
    process.exitCode = 1;
  } else {
    console.log('Alle checks PASS');
  }
})().finally(() => {
  rmSync(cache, { recursive: true, force: true });
});
