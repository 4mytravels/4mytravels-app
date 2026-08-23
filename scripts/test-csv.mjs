#!/usr/bin/env node
// CSV service tests: export round-trip, own-format detection, TravelSpend
// alias detection & parsing. Runs standalone: node scripts/test-csv.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();
const tsc = join(root, 'node_modules', '.bin', 'tsc');
let failed = 0;
const assert = (c, m) => { if (c) console.log('PASS:', m); else { console.error('FAIL:', m); failed++; } };

const cache = mkdtempSync(join(tmpdir(), '4mt-csv-'));
try {
  execFileSync(tsc, ['--ignoreConfig','--module','commonjs','--target','es2020','--moduleResolution','node','--esModuleInterop','--skipLibCheck','--ignoreDeprecations','6.0','--outDir',cache,'src/services/csv.ts','src/types/index.ts'], { cwd: root, stdio: 'pipe' });
} catch (e) {
  console.error('COMPILE FAIL:', e.stderr?.toString()?.slice(0, 600));
  process.exit(1);
}
const csv = require(join(cache, 'services', 'csv.js'));

// --- export ---
const expenses = [
  { id: 'a1', tripId: 't1', amount: 12.5, currency: 'JPY', rateToHome: 0.0062, rateDate: '2026-10-02',
    category: 'Food', createdAt: '2026-10-02T12:00:00Z', country: 'JP', paymentMethod: 'card', notes: 'Ramen, with "quotes" & comma' },
  { id: 'a2', tripId: 't1', amount: 3, currency: 'EUR', rateToHome: 1, rateDate: '2026-10-03',
    category: 'Coffee', createdAt: '2026-10-03T09:00:00Z', paymentMethod: 'cash' },
];
const out = csv.expensesToCsv(expenses, { t1: 'Japan' });
assert(out.split('\n').length === 3, 'header + 2 rows');
assert(out.includes('"Ramen, with ""quotes"" & comma"'), 'notes escaped (comma+quotes)');
assert(out.includes(',Japan,'), 'trip name resolved');

// --- parse back (own format) ---
const rows = csv.parseCsv(out);
assert(csv.isOwnExpenseCsv(rows[0]), 'own CSV detected');
const parsed = csv.parseOwnCsv(rows, 'fallback-trip');
assert(parsed.length === 2, '2 expenses parsed back');
assert(parsed[0].notes === 'Ramen, with "quotes" & comma', 'notes unescaped correctly');
assert(parsed[0].amount === 12.5 && parsed[0].currency === 'JPY', 'amount/currency intact');
assert(parsed[0].id === 'a1' && parsed[1].id === 'a2', 'ids preserved (re-import updates)');

// --- TravelSpend detection & parsing — REAL export format (user-verified 2026) ---
const tsHeader = [
  'amount','amountInHomeCurrency','category','conversionRate','country','countryCode',
  'datePaid','homeCurrency','localCurrency','notes','paidBy','paidFor','m.bakker',
  'paymentMethod','photo','place','latitude','longitude','type','numberOfDays',
];
const tsRows = [
  tsHeader,
  // "12,10" comma-decimal, datePaid dd-mm-yyyy, Transportation→Transport, Credit Card→card
  ['"12,10"','"12,10"','Groceries','"1"','Greece','GR','08-11-2023','EUR','EUR','first night','','','12,10','Credit Card','','Spata','','37,931','Expense','1'],
  ['"9,00"','"9,00"','Transportation','"1"','Greece','GR','09-11-2023','EUR','EUR','','','','9,00','Cash','','','','','','Expense','1'],
  ['','','','','','','','','','','','','','','','','','','Refund','1'], // type≠Expense → skipped
];
assert(csv.looksLikeTravelSpendCsv(tsRows[0]), 'TravelSpend REAL header detected');
assert(!csv.isOwnExpenseCsv(tsRows[0]), 'not mistaken for own CSV');
const ts = csv.parseTravelSpendCsv(tsRows, 'tripX');
assert(ts.items.length === 2, `2 valid TS rows parsed (got ${ts.items.length})`);
assert(ts.skipped === 1, `1 row skipped (got ${ts.skipped})`);
assert(ts.items[0].amount === 12.10 && ts.items[0].currency === 'EUR', 'comma-decimal amount + localCurrency');
assert(ts.items[0].rateDate === '2023-11-08', 'datePaid dd-mm-yyyy → ISO');
assert(ts.items[0].category === 'Groceries', 'direct category match');
assert(ts.items[1].category === 'Transport', 'Transportation → Transport');
assert(ts.items[0].paymentMethod === 'card', 'Credit Card → card');
assert(ts.items[1].paymentMethod === 'cash', 'Cash → cash');
assert(ts.items[0].rateToHome === 1, 'conversionRate parsed');
assert(ts.items[0].country === 'GR', 'countryCode used');

console.log(failed === 0 ? '\n=== CSV TESTS: ALLE PASS ===' : `\n${failed} FAILURES`);
rmSync(cache, { recursive: true, force: true });
process.exitCode = failed ? 1 : 0;
