// Pure list operations behind the shared expense store (M1). Kept free of
// React/zustand/DB imports so scripts/test-expense-store.mjs can compile and
// assert them without a device.
import type { Expense } from '../types';

/**
 * The list the screens hold is the METADATA list (pattern 43): never keep
 * receipt bytes in it. A form hands back the full row (with the photo); storing
 * that in the shared list would put ~350 KB per receipt in memory on every
 * screen. The edit path always re-loads the full row via loadExpense().
 */
export function toListEntry(e: Expense): Expense {
  return e.receiptPhoto == null ? e : { ...e, receiptPhoto: null };
}

/** Same order as loadExpenses(): created_at DESC, id as stable tie-breaker. */
export function compareExpensesDesc(a: Expense, b: Expense): number {
  const ka = a.createdAt ?? a.rateDate ?? '';
  const kb = b.createdAt ?? b.rateDate ?? '';
  if (ka !== kb) return ka < kb ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * Insert or replace by id and keep the list sorted. Replacing matters: the
 * old screens did `[expense, ...prev]` after an EDIT too, so an edited expense
 * appeared twice until the next reload.
 */
export function upsertExpense(list: Expense[], e: Expense): Expense[] {
  const entry = toListEntry(e);
  const next = list.filter((x) => x.id !== e.id);
  next.push(entry);
  return next.sort(compareExpensesDesc);
}

export function removeExpenseById(list: Expense[], id: string): Expense[] {
  return list.filter((x) => x.id !== id);
}

export function removeExpensesOfTrip(list: Expense[], tripId: string): Expense[] {
  return list.filter((x) => x.tripId !== tripId);
}

export function expensesOfTrip(list: Expense[], tripId: string): Expense[] {
  return list.filter((x) => x.tripId === tripId);
}

/** Group by trip id; every listed trip gets an entry, also when it is empty. */
export function groupExpensesByTrip(list: Expense[], tripIds: string[] = []): Record<string, Expense[]> {
  const map: Record<string, Expense[]> = {};
  for (const id of tripIds) map[id] = [];
  for (const e of list) (map[e.tripId] ??= []).push(e);
  return map;
}
