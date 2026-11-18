#!/usr/bin/env node
// Regression test for src/utils/rowCountry.ts (row shows country only when it
// differs from the trip's dominant country).  Gebruik: node scripts/test-row-country.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();
let failed = 0;
const assert = (c, m) => { if (c) console.log('PASS:', m); else { console.error('FAIL:', m); failed++; } };

const cache = mkdtempSync(join(tmpdir(), '4mt-rowcountry-'));
try {
  execFileSync(join(root, 'node_modules', '.bin', 'tsc'), [
    '--ignoreConfig', '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck',
    '--ignoreDeprecations', '6.0', '--outDir', cache, 'src/utils/rowCountry.ts',
  ], { cwd: root, stdio: 'pipe' });
  const { dominantCountry, dominantCountryByTrip, countryDiffers } = require(join(cache, 'rowCountry.js'));

  assert(dominantCountry([]) === undefined, 'leeg → undefined');
  assert(dominantCountry([{ country: 'PH' }, { country: 'PH' }, { country: 'JP' }]) === 'PH', 'meest voorkomend wint');
  assert(dominantCountry([{ country: 'PH' }, { country: 'JP' }]) === 'JP', 'gelijkspel → alfabetisch eerste');
  assert(dominantCountry([{}, { country: 'TH' }]) === 'TH', 'rijen zonder land tellen niet');

  const by = dominantCountryByTrip([
    { tripId: 'a', country: 'PH' }, { tripId: 'a', country: 'PH' }, { tripId: 'a', country: 'SG' },
    { tripId: 'b', country: 'JP' }, { tripId: 'c' },
  ]);
  assert(by.a === 'PH' && by.b === 'JP', 'per trip eigen dominant land');
  assert(!('c' in by), 'trip zonder landen → geen entry');

  assert(countryDiffers('SG', 'PH') === true, 'ander land → tonen');
  assert(countryDiffers('PH', 'PH') === false, 'zelfde land → verbergen');
  assert(countryDiffers(undefined, 'PH') === false, 'geen land → verbergen');
  assert(countryDiffers('PH', undefined) === true, 'geen primair land → tonen');
} finally {
  rmSync(cache, { recursive: true, force: true });
}
if (failed) { console.error(`${failed} failure(s)`); process.exit(1); }
console.log('All row-country tests passed.');
