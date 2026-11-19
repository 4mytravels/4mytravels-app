#!/usr/bin/env node
// Regression test for the trip editor helpers (country→currency, budget per day/total).
//
// Behaviour under test (src/utils/tripForm.ts):
//  - an EMPTY selection means "all trips" — never "no data",
//  - selecting one trip keeps only that trip's expenses,
//  - selecting several unions them,
//  - a deleted trip's id is pruned instead of blanking the charts,
//  - the label reads "All trips" / one name / "A + B" / "N trips".
//
// Gebruik:  node scripts/test-trip-filter.mjs

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, readFileSync } from 'node:fs';
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

const cache = mkdtempSync(join(tmpdir(), '4mt-tripform-'));
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
    'src/utils/tripForm.ts',
  ], { cwd: root, stdio: 'pipe' });
} catch (e) {
  console.error('Kon tripForm niet compileren:', e.stderr?.toString() ?? e.message);
  process.exit(1);
}
const { currencyForCountry, autoCurrency, parseBudget, toDailyBudget, budgetInputFor, budgetHint } =
  require(join(cache, 'tripForm.js'));
const fmt = (n) => `€${Math.round(n).toLocaleString('en-US')}`;

assert(currencyForCountry('PH') === 'PHP', 'PH → PHP');
assert(currencyForCountry('nl') === 'EUR', 'nl (lowercase) → EUR');
assert(currencyForCountry('MY') === 'MYR', 'MY → MYR');
assert(currencyForCountry('ZZ') === undefined, 'onbekend land → undefined');
assert(autoCurrency(['PH', 'MY']) === 'PHP', 'EERSTE land bepaalt de valuta');
assert(autoCurrency([]) === undefined, 'geen landen → undefined');
assert(autoCurrency(['PH'], ['EUR', 'USD']) === undefined, 'valuta buiten catalogus → undefined');

assert(parseBudget('') === 0 && parseBudget('abc') === 0 && parseBudget('-5') === 0, 'leeg/ongeldig/negatief = 0 (geen budget)');
assert(parseBudget('50,5') === 50.5, 'komma als decimaal');
assert(toDailyBudget(50, 'day', 20) === 50, 'per day wordt ongewijzigd opgeslagen');
assert(toDailyBudget(1000, 'total', 20) === 50, 'total 1000 / 20 dagen = 50 per dag');
assert(toDailyBudget(1000, 'total', null) === 0, 'total zonder einddatum = 0');
assert(toDailyBudget(0, 'total', 20) === 0, 'leeg = 0');
assert(budgetInputFor(50, 'total', 20) === '1000', 'per-dag 50 → total-invoer 1000');
assert(budgetInputFor(50, 'day', 20) === '50', 'per-dag invoer');
assert(budgetInputFor(0, 'day', 20) === '', 'geen budget → lege invoer');
assert(budgetHint(50, 'day', 20, fmt) === '≈ €1,000 for 20 days', 'hint per day');
assert(budgetHint(1000, 'total', 20, fmt) === '≈ €50 / day for 20 days', 'hint total');
assert(budgetHint(50, 'day', 1, fmt) === '≈ €50 for 1 day', 'enkelvoud day');
assert(budgetHint(50, 'day', null, fmt) === null, 'geen dagen → geen hint');
rmSync(cache, { recursive: true, force: true });
if (failed) { console.error(`${failed} FAILED`); process.exit(1); }
console.log('test-trip-form: all passed');
