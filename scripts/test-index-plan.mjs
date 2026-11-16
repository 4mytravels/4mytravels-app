// Q5: verify the created_at indexes from src/db/migrations.ts are used by the
// list queries in src/db/expenseRepo.ts (no "USE TEMP B-TREE FOR ORDER BY").
// Runs the real MIGRATIONS array against node:sqlite (in-memory).
//   node scripts/test-index-plan.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/db/migrations.ts', import.meta.url), 'utf8');
const block = src.slice(src.indexOf('export const MIGRATIONS'), src.indexOf('];'));
const statements = [...block.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

const db = new DatabaseSync(':memory:');
for (const sql of statements) db.exec(sql);

let failed = 0;
for (const q of [
  'SELECT id FROM expenses ORDER BY created_at DESC',
  "SELECT id FROM expenses WHERE trip_id = 'x' ORDER BY created_at DESC",
]) {
  const plan = db.prepare(`EXPLAIN QUERY PLAN ${q}`).all().map((r) => r.detail).join(' / ');
  const ok = /idx_expenses_(trip_)?created/.test(plan) && !/TEMP B-TREE/.test(plan);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${q}\n      ${plan}`);
}
if (failed) process.exit(1);
console.log('All index-plan tests passed');
