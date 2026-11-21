#!/usr/bin/env node
// Regression test for src/utils/csvExportFiles.ts. Gebruik: node scripts/test-csv-export-files.mjs
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
const cache = mkdtempSync(join(tmpdir(), '4mt-csvx-'));
try {
  execFileSync(tsc, ['--ignoreConfig', '--module', 'commonjs', '--target', 'es2020', '--moduleResolution', 'node',
    '--skipLibCheck', '--ignoreDeprecations', '6.0', '--outDir', cache, 'src/utils/csvExportFiles.ts'], { cwd: root, stdio: 'pipe' });
} catch (e) { console.error('compile failed:', e.stderr?.toString() ?? e.message); process.exit(1); }
const { sanitizeFileName, csvFileNameForTrip, planTripCsvFiles, savedMessage } = require(join(cache, 'csvExportFiles.js'));

assert(sanitizeFileName('India') === 'India', 'plain name kept');
assert(sanitizeFileName('Côte d’Ivoire / Ghana!') === 'Cote-d-Ivoire-Ghana', 'accents + punctuation sanitized');
assert(sanitizeFileName('  ../..  ') === 'trip', 'path traversal -> trip');
assert(sanitizeFileName('') === 'trip', 'empty -> trip');
assert(sanitizeFileName('a'.repeat(100)).length === 60, 'length capped');
assert(csvFileNameForTrip({ id: '1', name: 'India', startDate: '2026-03-01' }) === 'travelspend_export_India-2026.csv', 'filename format');
assert(csvFileNameForTrip({ id: '1', name: 'X', startDate: '' }, 2025) === 'travelspend_export_X-2025.csv', 'missing start -> fallback year');

const trips = [
  { id: 'a', name: 'Japan', startDate: '2026-01-01' },
  { id: 'b', name: 'Empty', startDate: '2026-02-01' },
  { id: 'c', name: 'japan', startDate: '2026-05-01' },
  { id: 'd', name: 'Peru', startDate: '2024-05-01' },
];
const ex = [{ tripId: 'd' }, { tripId: 'a' }, { tripId: 'a' }, { tripId: 'c' }, { tripId: 'zz' }];
const plan = planTripCsvFiles(trips, ex);
assert(plan.length === 3, 'trips without expenses + orphan rows dropped');
assert(plan.map((p) => p.trip.id).join() === 'a,c,d', 'trip order kept');
assert(plan[0].expenses.length === 2, 'grouped per trip');
assert(plan[1].fileName === 'travelspend_export_japan-2026-2.csv', 'case-insensitive name collision de-duplicated');
assert(new Set(plan.map((p) => p.fileName)).size === plan.length, 'all names unique');
assert(plan[2].fileName === 'travelspend_export_Peru-2024.csv', 'year per trip');
assert(savedMessage(1, null) === '1 file saved.' && savedMessage(3, 'Downloads') === '3 files saved to Downloads.', 'status text');

rmSync(cache, { recursive: true, force: true });
if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log('all passed');
