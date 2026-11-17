#!/usr/bin/env node
// Regression test for the shared expense store's list logic (M1).
//
// Behaviour under test (src/utils/expenseList.ts):
//  - an EDIT replaces the row (the old screens prepended it a second time),
//  - a new row lands in created_at DESC order, id as tie-breaker,
//  - the shared list never keeps receipt bytes (pattern 43),
//  - delete / trip delete remove exactly the right rows,
//  - groupExpensesByTrip gives every listed trip a (possibly empty) entry.
//
// Gebruik:  node scripts/test-expense-store.mjs

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

const cache = mkdtempSync(join(tmpdir(), '4mt-store-'));
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
    'src/utils/expenseList.ts',
  ], { cwd: root, stdio: 'pipe' });
} catch (e) {
  console.error('Kon expenseList niet compileren:', e.stderr?.toString() ?? e.message);
  process.exit(1);
}

try {
  // expenseList.ts imports ../types, so tsc emits with rootDir src → utils/.
  const { existsSync } = await import('node:fs');
  const out = [join(cache, 'utils', 'expenseList.js'), join(cache, 'expenseList.js')].find((p) => existsSync(p));
  const L = require(out);
  const mk = (id, tripId, createdAt, extra = {}) => ({
    id, tripId, amount: 10, currency: 'EUR', rateToHome: 1, rateDate: createdAt.slice(0, 10),
    category: 'Food', createdAt, paymentMethod: 'card', receiptPhoto: null, ...extra,
  });

  let list = [
    mk('c', 'T1', '2026-11-03T10:00:00.000Z'),
    mk('b', 'T1', '2026-11-02T10:00:00.000Z'),
    mk('a', 'T2', '2026-11-01T10:00:00.000Z'),
  ];

  // Edit = replace, not a duplicate.
  const edited = L.upsertExpense(list, { ...list[1], amount: 99 });
  assert(edited.length === 3, 'edit keeps the list length (no duplicate row)');
  assert(edited.find((e) => e.id === 'b').amount === 99, 'edit replaces the row');
  assert(edited.map((e) => e.id).join('') === 'cba', 'edit keeps created_at DESC order');

  // Edit that moves the date re-sorts.
  const moved = L.upsertExpense(list, { ...list[2], createdAt: '2026-11-04T10:00:00.000Z' });
  assert(moved.map((e) => e.id).join('') === 'acb', 'moving a row to a newer date puts it on top');

  // Insert.
  const added = L.upsertExpense(list, mk('d', 'T2', '2026-11-02T12:00:00.000Z'));
  assert(added.map((e) => e.id).join('') === 'cdba', 'a new row lands at its created_at position');

  // Tie on created_at → id DESC, stable.
  const tie = L.upsertExpense([mk('x', 'T1', '2026-11-05T00:00:00.000Z')], mk('y', 'T1', '2026-11-05T00:00:00.000Z'));
  assert(tie.map((e) => e.id).join('') === 'yx', 'same created_at → id DESC tie-break');

  // No receipt bytes in the shared list.
  const withPhoto = L.upsertExpense(list, mk('p', 'T1', '2026-11-06T00:00:00.000Z', { receiptPhoto: new Uint8Array([1, 2, 3]) }));
  assert(withPhoto[0].id === 'p' && withPhoto[0].receiptPhoto === null, 'receipt bytes are stripped from the list entry');

  // Input is not mutated.
  assert(list.length === 3 && list[1].amount === 10, 'upsert does not mutate its input');

  // Delete.
  assert(L.removeExpenseById(list, 'b').map((e) => e.id).join('') === 'ca', 'remove by id');
  assert(L.removeExpenseById(list, 'zzz').length === 3, 'removing an unknown id is a no-op');
  assert(L.removeExpensesOfTrip(list, 'T1').map((e) => e.id).join('') === 'a', 'trip delete drops only that trip');

  // Per-trip views.
  assert(L.expensesOfTrip(list, 'T1').length === 2, 'expensesOfTrip filters by trip');
  const g = L.groupExpensesByTrip(list, ['T1', 'T2', 'T3']);
  assert(g.T1.length === 2 && g.T2.length === 1 && Array.isArray(g.T3) && g.T3.length === 0,
    'groupExpensesByTrip: every listed trip gets an entry, empty trips included');
  assert(g.T1.map((e) => e.id).join('') === 'cb', 'groups keep the list order');
} finally {
  rmSync(cache, { recursive: true, force: true });
}

if (failed > 0) {
  console.error(`\n${failed} expense-store test(s) failed`);
  process.exit(1);
}
console.log('\nAll expense-store tests passed');
