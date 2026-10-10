#!/usr/bin/env node
// Regression tests for the CSV number parser.
//
// Two bugs, both in parseCsvNumber:
//   1. "35.000" VND/IDR imported as 35 (separator read as a decimal point).
//   2. My first fix over-corrected: it applied the thousands-grouping rule to
//      the CONVERSION RATE column too. A rate of "44.444" (THB per EUR) became
//      44444, so rateToHome = 1/44444 instead of 1/44.444 — a 1000x
//      undervaluation. That produced the exact numbers the user reported:
//      8.000 THB showed as 0.18 EUR instead of 208.78 EUR, and 18.3 MYR
//      showed as 0.00 EUR.
//
// Gebruik:  node scripts/test-csv-numbers.mjs

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

const cache = mkdtempSync(join(tmpdir(), '4mt-csv-'));
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
    'src/types/index.ts',
    'src/services/csv.ts',
  ], { cwd: root, stdio: 'pipe' });
} catch (e) {
  console.error('Kon csv.ts niet compileren:', e.stderr?.toString() ?? e.message);
  process.exit(1);
}

const { parseCsvNumber, parseTravelSpendCsv, parseCsv } = require(join(cache, 'services', 'csv.js'));

// ---- amounts: grouping is allowed ----------------------------------------
assert(parseCsvNumber('35.000', 'VND') === 35000, 'VND 35.000 -> 35000');
assert(parseCsvNumber('35,000', 'VND') === 35000, 'VND 35,000 -> 35000');
assert(parseCsvNumber('35.000', 'IDR') === 35000, 'IDR 35.000 -> 35000');
assert(parseCsvNumber('8.000', 'THB') === 8000, 'THB 8.000 -> 8000');
assert(parseCsvNumber('18.3', 'MYR') === 18.3, 'MYR 18.3 -> 18.3');
assert(parseCsvNumber('1,234', 'EUR') === 1234, 'EUR 1,234 -> 1234');
assert(parseCsvNumber('1,234,567', 'EUR') === 1234567, 'EUR 1,234,567 -> 1234567');
assert(parseCsvNumber('1.234,56', 'EUR') === 1234.56, 'EUR 1.234,56 -> 1234.56');
assert(parseCsvNumber('1,234.56', 'EUR') === 1234.56, 'EUR 1,234.56 -> 1234.56');
assert(parseCsvNumber('12,10', 'EUR') === 12.1, 'EUR 12,10 -> 12.1');
assert(parseCsvNumber('1250.75', 'EUR') === 1250.75, 'EUR 1250.75 -> 1250.75');
assert(parseCsvNumber('0.50', 'EUR') === 0.5, 'EUR 0.50 -> 0.5');
assert(parseCsvNumber('208.78', 'THB') === 208.78, 'THB 208.78 -> 208.78');

// ---- rates: grouping must NOT apply -------------------------------------
// allowGrouping = false (what parseTravelSpendCsv uses for the rate column)
assert(parseCsvNumber('44.444', undefined, false) === 44.444, 'rate 44.444 -> 44.444 (NIET 44444)');
assert(parseCsvNumber('1.234', undefined, false) === 1.234, 'rate 1.234 -> 1.234 (NIET 1234)');
assert(parseCsvNumber('4,5', undefined, false) === 4.5, 'rate 4,5 -> 4.5');
assert(parseCsvNumber('0.026', undefined, false) === 0.026, 'rate 0.026 -> 0.026');
assert(parseCsvNumber('22.5', undefined, false) === 22.5, 'rate 22.5 -> 22.5');
assert(parseCsvNumber('1', undefined, false) === 1, 'rate 1 -> 1');

// ---- end-to-end: the two numbers the user actually reported --------------
// 8.000 THB at ~44.444 THB/EUR must be ~180 EUR, not 0.18 EUR.
const thbCsv = [
  'datePaid,amount,amountInHomeCurrency,category,conversionRate,country,countryCode,homeCurrency,localCurrency,notes,paymentMethod,type',
  '01-02-2026,8.000,,Food,44.444,Thailand,TH,EUR,THB,market,Cash,Expense',
].join('\n');
const thb = parseTravelSpendCsv(parseCsv(thbCsv), 'T1').items[0];
assert(thb.amount === 8000, 'eind-tot-eind: THB amount 8000 (got ' + thb.amount + ')');
assert(Math.abs(thb.rateToHome - 1 / 44.444) < 1e-12, 'eind-tot-eind: rateToHome = 1/44.444 (got ' + thb.rateToHome + ')');
assert(Math.abs(8000 * thb.rateToHome - 180.02) < 0.05,
  'eind-tot-eind: 8000 THB = ' + (8000 * thb.rateToHome).toFixed(2) + ' EUR (was 0.18)');

// 18.3 MYR at ~4.7 MYR/EUR must be a few EUR, not 0.00.
const myrCsv = [
  'datePaid,amount,amountInHomeCurrency,category,conversionRate,country,countryCode,homeCurrency,localCurrency,notes,paymentMethod,type',
  '03-02-2026,18.3,,Food,4.7,Malaysia,MY,EUR,MYR,taxi,Cash,Expense',
].join('\n');
const myr = parseTravelSpendCsv(parseCsv(myrCsv), 'T1').items[0];
assert(myr.amount === 18.3, 'eind-tot-eind: MYR amount 18.3 (got ' + myr.amount + ')');
assert(Math.abs(18.3 * myr.rateToHome - 3.89) < 0.01,
  'eind-tot-eind: 18.3 MYR = ' + (18.3 * myr.rateToHome).toFixed(2) + ' EUR (was 0.00)');

// ---- regression: VND still works through the full pipeline ---------------
const vndCsv = [
  'datePaid,amount,amountInHomeCurrency,category,conversionRate,country,countryCode,homeCurrency,localCurrency,notes,paymentMethod,type',
  '01-02-2026,35.000,1,Food,35000,Japan,JP,EUR,VND,ramen,Cash,Expense',
].join('\n');
const vnd = parseTravelSpendCsv(parseCsv(vndCsv), 'T1').items[0];
assert(vnd.amount === 35000, 'eind-tot-eind: VND amount 35000 (got ' + vnd.amount + ')');
assert(Math.abs(vnd.rateToHome - 1 / 35000) < 1e-12, 'eind-tot-eind: VND rate correct');

// ---- a genuinely grouped amount still works alongside an ungrouped rate ---
// NOTE: the amount MUST be quoted — an unquoted "1,234.56" is two CSV columns.
const mixedCsv = [
  'datePaid,amount,amountInHomeCurrency,category,conversionRate,country,countryCode,homeCurrency,localCurrency,notes,paymentMethod,type',
  '05-02-2026,"1,234.56",,Shopping,4.444,Nepal,NP,EUR,THB,market,Cash,Expense',
].join('\n');
const mixedRes = parseTravelSpendCsv(parseCsv(mixedCsv), 'T1');
const mixed = mixedRes.items[0];
assert(mixed != null, 'gegroepeerde amount wordt niet overgeslagen (skipped=' + mixedRes.skipped + ')');
assert(mixed.amount === 1234.56, 'gegroepeerde amount blijft 1234.56 (got ' + mixed.amount + ')');
assert(Math.abs(mixed.rateToHome - 1 / 4.444) < 1e-12, 'rate 4.444 blijft 4.444 (got ' + mixed.rateToHome + ')');

rmSync(cache, { recursive: true, force: true });
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILURE(S)`);
process.exit(failed === 0 ? 0 : 1);