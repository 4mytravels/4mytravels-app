#!/usr/bin/env node
// Regression test: receipt photos must never be silently dropped.
//
// WHY THIS EXISTS
// The list screens (home, Expenses, Statistics, trip cards) load expenses
// WITHOUT the receipt_photo BLOB — `SELECT *` on a 2000-row table with receipts
// took 814 ms and moved ~456 MB across the storage/JS boundary, versus 4.1 ms
// for the same rows without the blob (measured 2026-10-23).
//
// The danger that comes with that optimisation: `saveExpense` writes
// `receiptPhoto: receiptBytes` VERBATIM, so handing the edit form a
// receipt-less expense and then saving would DELETE the photo — the same class
// of bug as the COALESCE three-state trap in tripRepo.updateTrip. That is why
// `loadExpense(id)` exists and why every edit path must use it.
//
// This test pins the SQL contract with a recording adapter: no native module,
// no WASM, no database.
//
// Gebruik:  node scripts/test-expense-receipts.mjs

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
  else {
    console.error('FAIL:', msg);
    failed++;
  }
}

const cache = mkdtempSync(join(tmpdir(), '4mt-receipts-'));
try {
  try {
    symlinkSync(join(root, 'node_modules'), join(cache, 'node_modules'), 'dir');
  } catch {
    /* best effort */
  }
  execFileSync(
    tsc,
    [
      '--ignoreConfig',
      '--module',
      'commonjs',
      '--target',
      'es2020',
      '--moduleResolution',
      'node',
      '--esModuleInterop',
      '--skipLibCheck',
      '--ignoreDeprecations',
      '6.0',
      '--outDir',
      cache,
      'src/db/types.ts',
      'src/db/index.ts',
      'src/db/blob.ts',
      'src/db/expenseRepo.ts',
    ],
    { cwd: root, stdio: 'pipe' },
  );
} catch (e) {
  console.error('Kon expenseRepo niet compileren:', e.stderr?.toString() ?? e.message);
  process.exit(1);
}

const { loadExpenses, loadExpensesForList, loadExpense } = require(join(cache, 'db', 'expenseRepo.js'));

/** A row as the DB would return it, with a small receipt blob. */
function rowWithReceipt() {
  return {
    id: 'e1',
    trip_id: 't1',
    amount: 12.5,
    currency: 'EUR',
    rate_to_home: 1,
    rate_date: '2026-10-01',
    category: 'Food',
    created_at: '2026-10-01T12:00:00.000Z',
    country: 'NL',
    location: 'Amsterdam',
    payment_method: 'card',
    notes: 'lunch',
    receipt_photo: new Uint8Array([1, 2, 3, 4]),
    multi_day_split_start: null,
    multi_day_split_end: null,
  };
}

/** A row as the DB returns it when receipt_photo was NOT selected. */
function rowWithoutReceipt() {
  const r = rowWithReceipt();
  delete r.receipt_photo;
  return r;
}

const receipt = new Uint8Array([1, 2, 3, 4]);

/** Records every query() call; returns the rows the test supplies. */
function recordingAdapter(rows) {
  return {
    calls: [],
    async query(sql, params) {
      this.calls.push({ sql, params });
      return rows;
    },
  };
}

// ---------------------------------------------------------------------------
console.log('=== loadExpensesForList: must NOT touch receipt_photo ===');
{
  const db = recordingAdapter([rowWithoutReceipt()]);
  const list = await loadExpensesForList(undefined, db);
  const sql = db.calls[0].sql;
  assert(!sql.includes('receipt_photo'), 'list query bevat geen receipt_photo-kolom');
  assert(/^SELECT .* FROM expenses ORDER BY created_at DESC$/.test(sql), 'list query is een expliciete kolomlijst, geen SELECT *');
  for (const col of ['id', 'trip_id', 'amount', 'currency', 'rate_to_home', 'rate_date', 'category', 'created_at', 'country', 'location', 'payment_method', 'notes', 'multi_day_split_start', 'multi_day_split_end']) {
    assert(sql.includes(col), `list query bevat ${col}`);
  }
  assert(list.length === 1 && list[0].id === 'e1', 'list geeft de rij terug');
  assert(list[0].amount === 12.5 && list[0].notes === 'lunch', 'metadata is intact');
  assert(list[0].receiptPhoto === null, 'receiptPhoto is null zonder de kolom (dit is precies het risico)');
}

console.log('\n=== loadExpensesForList with a tripId ===');
{
  const db = recordingAdapter([rowWithoutReceipt()]);
  await loadExpensesForList('t1', db);
  const { sql, params } = db.calls[0];
  assert(!sql.includes('receipt_photo'), 'per-trip list query bevat geen receipt_photo');
  assert(sql.includes('WHERE trip_id = ?'), 'per-trip list query filtert op trip_id');
  assert(Array.isArray(params) && params[0] === 't1', 'per-trip list query bindt de tripId');
}

// ---------------------------------------------------------------------------
console.log('\n=== loadExpenses (default): MUST keep receipts (backup path) ===');
{
  const db = recordingAdapter([rowWithReceipt()]);
  const list = await loadExpenses(undefined, db);
  assert(db.calls[0].sql.includes('*'), 'default query is SELECT * (backup mag nooit foto\'s verliezen)');
  assert(list[0].receiptPhoto instanceof Uint8Array, 'default query geeft de bon-bytes terug');
  assert(list[0].receiptPhoto.length === 4, 'bon-bytes zijn compleet');
}
{
  const db = recordingAdapter([rowWithReceipt()]);
  const list = await loadExpenses('t1', db);
  const { sql, params } = db.calls[0];
  assert(sql.includes('*') && sql.includes('WHERE trip_id = ?'), 'per-trip default query is SELECT * met tripId');
  assert(params[0] === 't1', 'per-trip default query bindt de tripId');
  assert(list[0].receiptPhoto instanceof Uint8Array, 'per-trip default query geeft de bon-bytes terug');
}
{
  // Explicit opt-out through the option object (what loadExpensesForList wraps).
  const db = recordingAdapter([rowWithoutReceipt()]);
  await loadExpenses(undefined, db, { withReceipts: false });
  assert(!db.calls[0].sql.includes('receipt_photo'), 'withReceipts:false laat de kolom weg');
}

// ---------------------------------------------------------------------------
console.log('\n=== loadExpense(id): the edit path MUST get the full row ===');
{
  const db = recordingAdapter([rowWithReceipt()]);
  const one = await loadExpense('e1', db);
  const { sql, params } = db.calls[0];
  assert(sql.includes('*'), 'loadExpense gebruikt SELECT *');
  assert(sql.includes('WHERE id = ?'), 'loadExpense filtert op de primary key');
  assert(sql.includes('LIMIT 1'), 'loadExpense is begrensd tot 1 rij');
  assert(params[0] === 'e1', 'loadExpense bindt de id');
  assert(one && one.receiptPhoto instanceof Uint8Array && one.receiptPhoto.length === 4, 'loadExpense levert de bon-bytes');
}
{
  const db = recordingAdapter([]);
  const missing = await loadExpense('nope', db);
  assert(missing === null, 'onbekende id geeft null (formulier mag dan NIET openen)');
}

// ---------------------------------------------------------------------------
console.log('\n=== het dataverlies-scenario expliciet ===');
{
  // What WOULD happen if an edit path used the list loader: the form would get
  // receiptPhoto === null, and saveExpense writes that verbatim.
  const listDb = recordingAdapter([rowWithoutReceipt()]);
  const fromList = (await loadExpensesForList(undefined, listDb))[0];
  assert(fromList.receiptPhoto === null, 'lijst-load: bon is null');

  const editDb = recordingAdapter([rowWithReceipt()]);
  const fromLoad = await loadExpense(fromList.id, editDb);
  assert(fromLoad.receiptPhoto instanceof Uint8Array, 'loadExpense-load: bon is aanwezig');

  // A save built the way ExpenseForm builds it, from each source.
  const savedFromList = { id: fromList.id, receiptPhoto: fromList.receiptPhoto };
  const savedFromLoad = { id: fromLoad.id, receiptPhoto: fromLoad.receiptPhoto };
  assert(savedFromList.receiptPhoto === null, 'zonder loadExpense zou de save de bon WISSEN (het risico is reëel)');
  assert(savedFromLoad.receiptPhoto !== null, 'met loadExpense blijft de bon behouden (de fix)');
}

rmSync(cache, { recursive: true, force: true });

console.log('');
if (failed) {
  console.error(`=== RECEIPT TESTS: ${failed} FAILED ===`);
  process.exit(1);
}
console.log('=== RECEIPT TESTS: ALLE PASS ===');
