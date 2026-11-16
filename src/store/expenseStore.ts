// Zustand store for expenses — the SHARED source of truth for every list
// screen (M1). Loaded once (metadata only, no receipt BLOBs — pattern 43), then
// updated incrementally on save/delete, so switching tabs costs 0 queries and a
// change on one screen is visible on all of them. This replaces the per-screen
// `loadExpensesForList()` on every focus and the `skipNextFocusRef` workarounds.
//
// Bulk writers (CSV import, backup restore, share-target import) call
// `reload()` afterwards; a trip delete calls `removeTrip()`.
import { useEffect } from 'react';
import { create } from 'zustand';
import type { Expense } from '../types';
import {
  upsertExpense,
  removeExpenseById,
  removeExpensesOfTrip,
} from '../utils/expenseList';

interface ExpenseState {
  /** Metadata list, created_at DESC. receiptPhoto is always null here. */
  expenses: Expense[];
  /** True once the first load landed (Q8: spinner until then). */
  loaded: boolean;
  /** Bumps on every change — cheap dependency for derived data. */
  revision: number;
  /** Load once; concurrent callers share the same in-flight query. */
  ensureLoaded: () => Promise<void>;
  /** Re-read from storage (pull-to-refresh, after bulk writes). */
  reload: () => Promise<void>;
  /** Persist + update the list (insert or replace by id). */
  save: (expense: Expense) => Promise<void>;
  /** Delete from storage + list. */
  remove: (id: string) => Promise<void>;
  /** List-only: drop a deleted trip's rows (the DB delete already ran). */
  removeTrip: (tripId: string) => void;
  /** Forget everything (storage closed / re-locked). */
  reset: () => void;
}

let inflight: Promise<void> | null = null;

export const useExpenseStore = create<ExpenseState>((set, get) => ({
  expenses: [],
  loaded: false,
  revision: 0,

  ensureLoaded: () => {
    if (get().loaded) return Promise.resolve();
    return get().reload();
  },

  reload: () => {
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const { loadExpensesForList } = await import('../db/expenseRepo');
        const list = await loadExpensesForList();
        set((s) => ({ expenses: list, loaded: true, revision: s.revision + 1 }));
      } catch (e) {
        // Leave the spinner state; the storage error surfaces elsewhere.
        set({ loaded: true });
        console.error('expense store load failed', e);
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  },

  save: async (expense) => {
    const { saveExpense } = await import('../db/expenseRepo');
    await saveExpense(expense);
    set((s) => ({ expenses: upsertExpense(s.expenses, expense), revision: s.revision + 1 }));
  },

  remove: async (id) => {
    const { deleteExpense } = await import('../db/expenseRepo');
    await deleteExpense(id);
    set((s) => ({ expenses: removeExpenseById(s.expenses, id), revision: s.revision + 1 }));
  },

  removeTrip: (tripId) =>
    set((s) => ({ expenses: removeExpensesOfTrip(s.expenses, tripId), revision: s.revision + 1 })),

  reset: () => set((s) => ({ expenses: [], loaded: false, revision: s.revision + 1 })),
}));

/** Hook for screens: subscribe to the list and trigger the one-time load. */
export function useExpenses(): { expenses: Expense[]; loaded: boolean } {
  const expenses = useExpenseStore((s) => s.expenses);
  const loaded = useExpenseStore((s) => s.loaded);
  useEffect(() => {
    if (!loaded) void useExpenseStore.getState().ensureLoaded();
  }, [loaded]);
  return { expenses, loaded };
}
