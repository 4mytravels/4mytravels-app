#!/usr/bin/env node
// Expense-form category grid order (src/utils/categoryOrder.ts).
// Gebruik:  node scripts/test-category-order.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();
let failed = 0;
const assert = (c, m) => { if (c) console.log('PASS:', m); else { console.error('FAIL:', m); failed++; } };

const cache = mkdtempSync(join(tmpdir(), '4mt-catorder-'));
execFileSync(join(root, 'node_modules', '.bin', 'tsc'), [
  '--ignoreConfig', '--module', 'commonjs', '--target', 'es2020', '--moduleResolution', 'node',
  '--skipLibCheck', '--ignoreDeprecations', '6.0', '--outDir', cache, 'src/utils/categoryOrder.ts',
], { cwd: root, stdio: 'pipe' });
const { categoriesByUsage, visibleCategories } = require(join(cache, 'categoryOrder.js'));

const ALL = ['Food', 'Transport', 'Groceries', 'Activities', 'Coffee', 'Drinks', 'Shopping', 'Flights', 'General', 'Laundry', 'Gym', 'Work', 'Accommodation'];
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

assert(eq(categoriesByUsage([], ALL), ALL), 'geen historie → standaardvolgorde');
const hist = [{ category: 'Work' }, { category: 'Work' }, { category: 'Coffee' }, { category: 'Gym' }, { category: 'Gym' }, { category: 'Bogus' }];
const ord = categoriesByUsage(hist, ALL);
assert(eq(ord.slice(0, 4), ['Gym', 'Work', 'Coffee', 'Food']), 'meest gebruikt eerst, gelijkspel op standaardvolgorde');
assert(ord.length === ALL.length && !ord.includes('Bogus'), 'onbekende categorie genegeerd, niets kwijt');
assert(eq(ALL.slice(0, 2), ['Food', 'Transport']), 'input niet gemuteerd');

assert(eq(visibleCategories(ALL, 'Food', 11), ALL.slice(0, 11)), 'selectie zichtbaar → top 11 ongewijzigd');
const v = visibleCategories(ALL, 'Accommodation', 11);
assert(v.length === 11 && v[10] === 'Accommodation' && !v.includes('Gym'), 'selectie buiten top 11 vervangt laatste slot');
assert(eq(visibleCategories(ALL, null, 11), ALL.slice(0, 11)), 'geen selectie → top 11');

rmSync(cache, { recursive: true, force: true });
if (failed) { console.error(`\n${failed} test(s) gefaald`); process.exit(1); }
console.log('\nAlle category-order tests geslaagd.');
