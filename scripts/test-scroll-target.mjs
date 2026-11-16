#!/usr/bin/env node
// Regression test for the Expenses-tab auto-scroll target
// (src/utils/scrollTarget.ts): today's section, else the nearest day, else -1.
//
// Gebruik:  node scripts/test-scroll-target.mjs

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

const cache = mkdtempSync(join(tmpdir(), '4mt-scroll-'));
try {
  try { symlinkSync(join(root, 'node_modules'), join(cache, 'node_modules'), 'dir'); } catch { /* best effort */ }
  execFileSync(tsc, [
    '--ignoreConfig', '--module', 'commonjs', '--target', 'es2020',
    '--moduleResolution', 'node', '--esModuleInterop', '--skipLibCheck',
    '--ignoreDeprecations', '6.0', '--outDir', cache,
    'src/utils/scrollTarget.ts',
  ], { cwd: root, stdio: 'pipe' });
} catch (e) {
  console.error('Kon scrollTarget niet compileren:', e.stderr?.toString() ?? e.message);
  process.exit(1);
}

const { scrollTargetSection: f } = require(join(cache, 'scrollTarget.js'));
rmSync(cache, { recursive: true, force: true });

const days = ['2026-11-20', '2026-11-16', '2026-11-14', '2026-10-01']; // newest-first
assert(f(days, '2026-11-16') === 1, 'today aanwezig -> die sectie (ook als het niet index 0 is)');
assert(f(['2026-11-16', '2026-11-15'], '2026-11-16') === 0, 'today op index 0 -> 0 (de regressie: werd overgeslagen)');
assert(f(days, '2026-11-15') === 2, 'geen today: gelijke afstand -> verleden dag wint');
assert(f(days, '2026-11-19') === 0, 'geen today: dichtstbijzijnde (toekomst) dag');
assert(f(days, '2027-03-01') === 0, 'na de laatste dag -> nieuwste sectie');
assert(f(days, '2026-01-01') === 3, 'voor de eerste dag -> oudste sectie');
assert(f(['2026-03-29', '2026-03-27'], '2026-03-28') === 1, 'DST-week: gelijke afstand -> verleden');
assert(f([], '2026-11-16') === -1, 'lege lijst -> -1 (geen scroll)');

if (failed) { console.error(`${failed} test(s) failed`); process.exit(1); }
console.log('All scroll-target tests passed');
