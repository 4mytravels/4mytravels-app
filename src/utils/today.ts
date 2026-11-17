// G2: the "Today" block on Home — pure, so scripts/test-trip-days.mjs can
// assert the sums with a fixture (no screen, no DB).
import type { Expense, Trip } from '../types';
import { groupByDaySplitAware } from './days';
import { toHomeCurrency } from './currency';

/**
 * Is the trip running on the local calendar day `todayKey` (YYYY-MM-DD)?
 * Compared as DAY KEYS, never as `new Date('…T12:00:00')` against `now`: that
 * made a trip that starts TODAY invisible on Home until noon (pattern 39).
 * An end date of today still counts as running.
 */
export function isTripActiveOn(trip: Pick<Trip, 'startDate' | 'endDate'>, todayKey: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trip.startDate ?? '')) return false;
  if (trip.startDate > todayKey) return false;
  return !trip.endDate || trip.endDate >= todayKey;
}

/** The running trip on `todayKey`; with several, the most recently started. */
export function pickActiveTrip<T extends Pick<Trip, 'startDate' | 'endDate'>>(trips: T[], todayKey: string): T | undefined {
  return trips
    .filter((t) => isTripActiveOn(t, todayKey))
    .sort((a, b) => (a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0))[0];
}

export type TodaySummary = {
  /** Spent on `todayKey` for this trip, in the trip's home currency. */
  spent: number;
  /** The trip's daily budget, or null when the trip has none. */
  budget: number | null;
  /** spent / budget, clamped to [0, 1] for the bar; null without a budget. */
  ratio: number | null;
  /** true when spent > budget (only with a budget). */
  over: boolean;
  /** Number of entries (split shares count once per day). */
  count: number;
};

/**
 * Today's spend for ONE trip. Split-aware: a multi-day split contributes its
 * per-day share (already in home currency, pattern 1), never the full amount.
 * Same grouping as the Home list and the Expenses list (groupByDaySplitAware).
 */
export function summarizeToday(
  expenses: Expense[],
  trip: Pick<Trip, 'id' | 'dailyBudget'>,
  todayKey: string,
): TodaySummary {
  const own = expenses.filter((e) => e.tripId === trip.id);
  const section = groupByDaySplitAware(own).find((s) => s.day === todayKey);
  const entries = section?.data ?? [];
  const spent = entries.reduce((s, en) => s + (en.splitShare ?? toHomeCurrency(en.expense)), 0);
  const budget = trip.dailyBudget > 0 ? trip.dailyBudget : null;
  return {
    spent,
    budget,
    ratio: budget ? Math.min(1, Math.max(0, spent / budget)) : null,
    over: budget != null && spent > budget,
    count: entries.length,
  };
}
