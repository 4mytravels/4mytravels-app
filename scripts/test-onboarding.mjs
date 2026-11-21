#!/usr/bin/env node
// Regression test for first-start onboarding (src/utils/onboarding.ts).
// Gebruik:  node scripts/test-onboarding.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();
const tsc = join(root, 'node_modules', '.bin', 'tsc');
let failed = 0;
const assert = (c, m) => { if (c) console.log('PASS:', m); else { console.error('FAIL:', m); failed++; } };

const cache = mkdtempSync(join(tmpdir(), '4mt-onb-'));
try {
  try { symlinkSync(join(root, 'node_modules'), join(cache, 'node_modules'), 'dir'); } catch { /* best effort */ }
  execFileSync(tsc, ['--ignoreConfig', '--module', 'commonjs', '--target', 'es2020', '--moduleResolution', 'node',
    '--skipLibCheck', '--ignoreDeprecations', '6.0', '--outDir', cache, 'src/utils/onboarding.ts'], { cwd: root, stdio: 'pipe' });
} catch (e) { console.error('compile failed:', e.stderr?.toString() ?? e.message); process.exit(1); }
const { decideOnboarding, filterCurrencies, ONBOARDING_KEY } = require(join(cache, 'onboarding.js'));

assert(ONBOARDING_KEY === 'onboarding_done', 'flag key is onboarding_done');
assert(decideOnboarding(null, 0) === 'show', 'fresh install -> show');
assert(decideOnboarding(undefined, 0) === 'show', 'missing flag -> show');
assert(decideOnboarding(null, 3) === 'silent', 'existing user with trips -> silent');
assert(decideOnboarding('1', 0) === 'done', 'flag set -> done');
assert(decideOnboarding('1', 5) === 'done', 'flag set with trips -> done');
assert(decideOnboarding('true', 0) === 'done', "'true' flag -> done");
assert(decideOnboarding('', 0) === 'show', 'empty flag -> show');

const list = [{ code: 'EUR', name: 'Euro' }, { code: 'USD', name: 'US Dollar' }, { code: 'THB', name: 'Thai Baht' }];
assert(filterCurrencies(list, '').length === 3, 'empty query -> all');
assert(filterCurrencies(list, '  ').length === 3, 'whitespace query -> all');
assert(filterCurrencies(list, 'usd')[0]?.code === 'USD', 'code match, case-insensitive');
assert(filterCurrencies(list, 'baht')[0]?.code === 'THB', 'name match');
assert(filterCurrencies(list, 'dollar').length === 1, 'partial name');
assert(filterCurrencies(list, 'xyz').length === 0, 'no match -> empty');

rmSync(cache, { recursive: true, force: true });
if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nAll onboarding tests passed.');
