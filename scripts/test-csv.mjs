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

// --- TravelSpend detection & parsing (their typical export columns) ---
const tsHeader = ['Date','Title','Amount','Currency','CategoryName','MainCategoryName','Note'];
const tsRows = [
  tsHeader,
  ['2026-07-01','Hotel Bangkok','1250.75','THB','Accommodation','Lodging','First night'],
  ['01/07/2026','Street food','80,50','THB','Food','Eating out',''],
  ['','broken row','','THB','','',''], // skipped
];
assert(csv.looksLikeTravelSpendCsv(tsRows[0]), 'TravelSpend header detected');
assert(!csv.isOwnExpenseCsv(tsRows[0]), 'not mistaken for own CSV');
const ts = csv.parseTravelSpendCsv(tsRows, 'tripX');
assert(ts.items.length === 2, `2 valid TS rows parsed (got ${ts.items.length})`);
assert(ts.skipped === 1, `1 row skipped (got ${ts.skipped})`);
assert(ts.items[0].amount === 1250.75 && ts.items[0].currency === 'THB', 'TS amount/currency');
assert(ts.items[0].category === 'Accommodation', 'TS category matched');
assert(ts.items[0].notes === 'Hotel Bangkok', 'TS title → notes');
assert(ts.items[0].rateDate === '2026-07-01', 'TS ISO date kept');
assert(ts.items[1].rateDate === '2026-07-01', 'TS dd/mm/yyyy normalized');
assert(ts.items[1].amount === 80.5, 'TS comma-decimal parsed');

console.log(failed === 0 ? '\n=== CSV TESTS: ALLE PASS ===' : `\n${failed} FAILURES`);
rmSync(cache, { recursive: true, force: true });
process.exitCode = failed ? 1 : 0;
