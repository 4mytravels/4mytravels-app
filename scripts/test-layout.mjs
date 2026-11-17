#!/usr/bin/env node
// M11 regression: the max-width frame (src/theme/layout.ts + AppFrame wiring).
// 390 / 768 / 1280 px → a 560 px column; Stats routes widen only from 900 px.
// Gebruik:  node scripts/test-layout.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();
let failed = 0;
const assert = (c, m) => { if (c) console.log('PASS:', m); else { console.error('FAIL:', m); failed++; } };

const cache = mkdtempSync(join(tmpdir(), '4mt-layout-'));
try {
  execFileSync(join(root, 'node_modules', '.bin', 'tsc'), [
    '--ignoreConfig', '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck',
    '--ignoreDeprecations', '6.0', '--outDir', cache, 'src/theme/layout.ts',
  ], { cwd: root, stdio: 'pipe' });
  const { frameMaxWidth, isWideRoute, CONTENT_MAX_WIDTH } = require(join(cache, 'layout.js'));
  assert(CONTENT_MAX_WIDTH === 560, 'content column is 560 px');
  for (const w of [390, 768, 1280]) assert(frameMaxWidth(w, '/home') === 560, `home @ ${w}px → 560`);
  assert(frameMaxWidth(768, '/statistics') === 560, 'stats @ 768px → still 560 (one column)');
  assert(frameMaxWidth(900, '/statistics') > 560, 'stats @ 900px → wide');
  assert(frameMaxWidth(1280, '/stats/countries') > 560, 'stats sub-page @ 1280px → wide');
  assert(isWideRoute('/stats/over-time') && isWideRoute('/statistics') && !isWideRoute('/settings') && !isWideRoute('/home'), 'route matcher');
} finally {
  rmSync(cache, { recursive: true, force: true });
}
const layout = readFileSync(join(root, 'app/_layout.tsx'), 'utf8');
assert(/<AppFrame nav=\{<FloatingNav \/>\}>/.test(layout) && !/^\s*<FloatingNav \/>\s*$/m.test(layout), 'root layout wraps the navigator in AppFrame; nav passed as prop');
const stats = readFileSync(join(root, 'app/(tabs)/statistics.tsx'), 'utf8');
assert(/useWindowDimensions\(\)\.width >= WIDE_BREAKPOINT/.test(stats) && /twoCol \? styles\.cols/.test(stats), 'Statistics switches to two columns from WIDE_BREAKPOINT');

console.log(failed ? `\n${failed} failure(s)` : '\nall layout checks passed');
process.exit(failed ? 1 : 0);
