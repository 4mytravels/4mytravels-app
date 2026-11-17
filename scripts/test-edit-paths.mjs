// Guard for skill pattern 43: every screen that opens the expense form in EDIT
// mode must hand it the FULL row from loadExpense(id). List rows carry no
// receipt BLOB and saveExpense writes receiptPhoto verbatim, so handing the
// form a list row wipes the receipt on save (bug: "edit from Home wipes the
// receipt photo"). Static check — no DB, no native module.
import { readFileSync } from 'node:fs';

const screens = ['app/(tabs)/home.tsx', 'app/(tabs)/expenses.tsx', 'app/trip/[id]/index.tsx'];
let fails = 0;
const ok = (cond, msg) => { if (cond) console.log('  ok  ' + msg); else { fails++; console.log('  FAIL ' + msg); } };

for (const file of screens) {
  const src = readFileSync(file, 'utf8');
  const calls = [...src.matchAll(/setEditingExpense\(([^)]*)\)/g)].map((m) => m[1].trim());
  const nonNull = calls.filter((a) => a !== 'null');
  ok(nonNull.length > 0, `${file}: has an edit path`);
  ok(nonNull.every((a) => a === 'full'), `${file}: edit form only receives the loaded row (got ${JSON.stringify(nonNull)})`);
  ok(/const full = await loadExpense\(/.test(src), `${file}: loads the full row with loadExpense()`);
  // A failed load must NOT open the form: the null-branch returns before setFormOpen.
  ok(/if \(!full\) \{[^}]*return;\s*\}/.test(src), `${file}: a missing row returns before opening the form`);
}

console.log(fails ? `\n${fails} failure(s)` : '\nall edit paths load the full row');
process.exit(fails ? 1 : 0);
