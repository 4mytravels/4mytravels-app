#!/usr/bin/env node
// Regression test for src/utils/tripIcons.ts: every curated name exists in the
// installed Ionicons glyph map, null/unknown fall back to the default, and the
// repo writes only curated names (legacy rows / CSV / old backups → default).
//
// Gebruik:  node scripts/test-trip-icons.mjs

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();
let failed = 0;
const assert = (c, m) => { if (c) console.log('PASS:', m); else { console.error('FAIL:', m); failed++; } };

const cache = mkdtempSync(join(tmpdir(), '4mt-tripicons-'));
try {
  execFileSync(join(root, 'node_modules', '.bin', 'tsc'), [
    '--ignoreConfig', '--module', 'commonjs', '--target', 'es2020', '--moduleResolution', 'node',
    '--esModuleInterop', '--skipLibCheck', '--ignoreDeprecations', '6.0',
    '--outDir', cache, 'src/utils/tripIcons.ts',
  ], { cwd: root, stdio: 'pipe' });
} catch (e) {
  console.error('Kon tripIcons niet compileren:', e.stdout?.toString() ?? e.message);
  process.exit(1);
}
try {
  const m = require(join(cache, 'tripIcons.js'));
  const glyphs = JSON.parse(readFileSync(join(root,
    'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json'), 'utf8'));
  const missing = m.TRIP_ICONS.filter((n) => !(n in glyphs));
  assert(missing.length === 0, `all ${m.TRIP_ICONS.length} curated icons exist in Ionicons (missing: ${missing.join(',') || 'none'})`);
  assert(m.TRIP_ICONS.length >= 20 && m.TRIP_ICONS.length <= 30, 'curated set is ~24 icons');
  assert(new Set(m.TRIP_ICONS).size === m.TRIP_ICONS.length, 'no duplicates');
  assert(m.TRIP_ICONS[0] === m.DEFAULT_TRIP_ICON && m.DEFAULT_TRIP_ICON === 'airplane-outline', 'default = airplane-outline, first in grid');
  assert(m.tripIcon(undefined) === 'airplane-outline', 'undefined trip → default');
  assert(m.tripIcon({}) === 'airplane-outline', 'legacy trip without icon → default');
  assert(m.tripIcon({ icon: null }) === 'airplane-outline', 'NULL column → default');
  assert(m.tripIcon({ icon: 'not-an-icon' }) === 'airplane-outline', 'unknown name → default');
  assert(m.tripIcon({ icon: 'logo-github' }) === 'airplane-outline', 'real but non-curated Ionicon → default');
  assert(m.tripIcon({ icon: 'boat-outline' }) === 'boat-outline', 'curated name kept');
  assert(m.normalizeTripIcon(42) === null, 'non-string → null (stored as NULL)');
  assert(m.normalizeTripIcon('train-outline') === 'train-outline', 'normalize keeps curated');
} finally {
  rmSync(cache, { recursive: true, force: true });
}
if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log('all trip-icon tests passed');
