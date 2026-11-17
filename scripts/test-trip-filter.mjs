#!/usr/bin/env node
// Regression test for the Statistics trip filter (1 trip / several / all).
//
// Behaviour under test (src/utils/tripFilter.ts):
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

const cache = mkdtempSync(join(tmpdir(), '4mt-filter-'));
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
    'src/utils/tripFilter.ts',
  ], { cwd: root, stdio: 'pipe' });
} catch (e) {
  console.error('Kon tripFilter niet compileren:', e.stderr?.toString() ?? e.message);
  process.exit(1);
}

// Single-file compile → tsc drops the src/utils prefix (no rootDir guess when
// only one input file is given).
const { filterExpensesByTrips, pruneTripIds, tripFilterLabel, tripFilterShortLabel } =
  require(join(cache, 'tripFilter.js'));

const trips = [
  { id: 'alps', name: 'Alps 2026' },
  { id: 'bali', name: 'Bali 2026' },
  { id: 'japan', name: 'Japan 2026' },
];
const expenses = [
  { id: 'a1', tripId: 'alps', amount: 100 },
  { id: 'a2', tripId: 'alps', amount: 200 },
  { id: 'b1', tripId: 'bali', amount: 250 },
  { id: 'j1', tripId: 'japan', amount: 400 },
];

// --- filtering -------------------------------------------------------------
assert(filterExpensesByTrips(expenses, []).length === 4, 'lege selectie = alle trips (4 rijen)');
assert(
  filterExpensesByTrips(expenses, ['alps']).reduce((s, e) => s + e.amount, 0) === 300,
  'één trip: alleen Alps (300)',
);
assert(
  filterExpensesByTrips(expenses, ['alps', 'bali']).length === 3,
  'twee trips: Alps + Bali (3 rijen)',
);
assert(
  filterExpensesByTrips(expenses, ['alps', 'bali']).every((e) => e.tripId !== 'japan'),
  'niet-geselecteerde trip valt weg',
);
assert(
  filterExpensesByTrips(expenses, ['alps', 'bali', 'japan']).length === 4,
  'alles aanvinken = weer alle rijen',
);
assert(
  filterExpensesByTrips(expenses, ['alps', 'alps']).length === 2,
  'dubbele id in de selectie telt niet dubbel',
);
assert(filterExpensesByTrips(expenses, []).length !== 0, 'lege selectie is NOOIT "geen data"');

// --- deleted trip ----------------------------------------------------------
assert(
  JSON.stringify(pruneTripIds(['alps', 'weg'], trips)) === JSON.stringify(['alps']),
  'verwijderde trip wordt uit de selectie gefilterd',
);
assert(pruneTripIds(['weg'], trips).length === 0, 'selectie die alleen verwijderde trips bevat → alle trips');
assert(
  filterExpensesByTrips(expenses, pruneTripIds(['weg'], trips)).length === 4,
  'na prune valt de statistiek terug op alle trips (geen leeg scherm)',
);

// --- label -----------------------------------------------------------------
assert(tripFilterLabel([], trips) === 'All trips', 'label: All trips');
assert(tripFilterLabel(['alps'], trips) === 'Alps 2026', 'label: één naam');
assert(tripFilterLabel(['alps', 'bali'], trips) === 'Alps 2026 + Bali 2026', 'label: twee namen');
assert(tripFilterLabel(['alps', 'bali', 'japan'], trips) === '3 trips', 'label: drie of meer → "3 trips"');

// --- M10: chip label + shared store ----------------------------------------
assert(tripFilterShortLabel([], trips) === 'All trips', 'chip: All trips');
assert(tripFilterShortLabel(['japan'], trips) === 'Japan 2026', 'chip: één naam');
assert(tripFilterShortLabel(['japan', 'alps'], trips) === 'Japan 2026 +1', 'chip: eerste gekozen naam + aantal');
assert(tripFilterShortLabel(['bali', 'alps', 'japan'], trips) === 'Bali 2026 +2', 'chip: drie → "Bali 2026 +2"');

const storeCache = mkdtempSync(join(tmpdir(), '4mt-filterstore-'));
try {
  symlinkSync(join(root, 'node_modules'), join(storeCache, 'node_modules'), 'dir');
  execFileSync(tsc, [
    '--ignoreConfig', '--module', 'commonjs', '--target', 'es2020', '--moduleResolution', 'node',
    '--esModuleInterop', '--skipLibCheck', '--ignoreDeprecations', '6.0', '--outDir', storeCache,
    'src/store/tripFilterStore.ts',
  ], { cwd: root, stdio: 'pipe' });
  const { useTripFilterStore } = require(join(storeCache, 'tripFilterStore.js'));
  // Stats page A selects, page B (a different screen) reads the same state.
  const pageA = useTripFilterStore.getState();
  pageA.toggle('japan');
  pageA.toggle('alps');
  assert(JSON.stringify(useTripFilterStore.getState().selected) === '["japan","alps"]', 'store: selectie gedeeld tussen schermen');
  useTripFilterStore.getState().toggle('japan');
  assert(JSON.stringify(useTripFilterStore.getState().selected) === '["alps"]', 'store: toggle haalt weg');
  useTripFilterStore.getState().clear();
  assert(useTripFilterStore.getState().selected.length === 0, 'store: clear = All trips');
} finally {
  rmSync(storeCache, { recursive: true, force: true });
}
for (const f of ['app/(tabs)/statistics.tsx', 'app/stats/countries.tsx', 'app/stats/over-time.tsx']) {
  const src = readFileSync(join(root, f), 'utf8');
  assert(src.includes('useTripFilterStore((') && src.includes('<TripFilter') && !src.includes('setTripFilter'),
    `${f}: gebruikt de gedeelde TripFilter + store`);
}

if (failed) {
  console.error(`\n${failed} test(s) gefaald`);
  process.exit(1);
}
console.log('\nAlle trip-filter tests geslaagd.');
rmSync(cache, { recursive: true, force: true });