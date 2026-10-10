// Shared trip statistics — ONE source of truth for the Trips tab, the trip
// detail screen and the Expenses tab.
//
// Before this module each screen computed its own daily average / elapsed days
// / over-budget status, so the numbers disagreed between tabs. Everything that
// shows "Daily avg / budget", "Total spend / budget", "Over budget" or
// "Day X of Y" MUST go through computeTripStats() so they always match.

import type { Expense, Trip } from '../types';
import { groupByDaySplitAware } from './days';
import { toHomeCurrency } from './currency';
import { computePace, inclusiveDays, type PaceResult } from './pace';

/** Local YYYY-MM-DD key (never UTC — a trip day is the user's local day). */
export function localDayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface TripStats {
  /** Sum of every expense in the trip, converted to the trip home currency. */
  totalSpend: number;
  /** Split-aware sum restricted to elapsed days (future expenses excluded). */
  elapsedTotal: number;
  /** Days from trip start to the reference day, inclusive, min 1. */
  daysActive: number;
  /** elapsedTotal / daysActive — the "Daily avg" shown everywhere. */
  dailyAverage: number;
  /** Cumulative budget = dailyBudget * daysActive. */
  cumulativeBudget: number;
  /**
   * FULL trip budget = dailyBudget * totalDays (every day of the trip, not just
   * the days elapsed). This is the number the "Total spend / budget" figures
   * show: a 28-day trip shows the 28-day budget on day 21 too.
   * Falls back to cumulativeBudget for open-ended trips (no end date).
   */
  tripBudget: number;
  /** Pace status ("Over budget" / "On track") + Day X of Y. */
  pace: PaceResult;
  /** Total trip length in days (inclusive), when the trip has an end date. */
  totalDays?: number;
  /** True when the trip's end date is in the past: show "N days", not "Day X". */
  isFinished: boolean;
}

/**
 * Reference day for "days elapsed":
 *  - past trip → the trip end date (the trip is over; counting further is wrong)
 *  - active trip → today, capped at the trip end date.
 *
 * Future (pre-logged) expenses NEVER move the reference day: they are excluded
 * from `elapsedTotal` as well, so pre-logging can neither deflate the daily
 * average nor inflate the cumulative budget.
 */
function referenceMs(trip: Trip, today: Date): number {
  const todayStart = new Date(today);
  todayStart.setHours(12, 0, 0, 0);
  const endMs = trip.endDate ? new Date(`${trip.endDate}T12:00:00`).getTime() : NaN;
  if (!Number.isNaN(endMs) && endMs < todayStart.getTime()) return endMs;
  return Number.isNaN(endMs) || endMs > todayStart.getTime() ? todayStart.getTime() : endMs;
}

export function computeTripStats(trip: Trip, expenses: Expense[], today: Date = new Date()): TripStats {
  const totalSpend = expenses.reduce((sum, e) => sum + toHomeCurrency(e), 0);

  const sections = groupByDaySplitAware(expenses);
  const todayStr = localDayKey(today);
  const elapsedTotal = sections
    .filter((s) => s.day <= todayStr)
    .reduce((sum, s) => sum + s.data.reduce((acc, entry) => acc + (entry.splitShare ?? toHomeCurrency(entry.expense)), 0), 0);

  const ref = referenceMs(trip, today);
  // Local day key, NEVER toISOString(): a local-noon timestamp can land on the
  // previous/next UTC day and shift the count by one.
  const referenceDate = localDayKey(new Date(ref));
  const daysActive = inclusiveDays(trip.startDate, referenceDate);

  // Pace gets the SAME reference day, so "Day X of Y", "Over budget" and the
  // daily average are all derived from one day count.
  const pace = computePace({
    dailyBudget: trip.dailyBudget,
    tripStartDate: trip.startDate,
    tripEndDate: trip.endDate,
    today,
    cumulativeActualSpend: totalSpend,
    referenceDate,
  });

  const totalDays = trip.endDate ? inclusiveDays(trip.startDate, trip.endDate) : undefined;

  return {
    totalSpend,
    elapsedTotal,
    daysActive,
    dailyAverage: elapsedTotal / daysActive,
    cumulativeBudget: trip.dailyBudget * daysActive,
    // Full-length budget: every day of the trip is budgeted for from day 1, so
    // the trip card always shows the complete trip budget (user request: a
    // 28-day trip on day 21 must show the 28-day budget, not the day-21 one).
    tripBudget: trip.dailyBudget * (totalDays ?? daysActive),
    pace,
    totalDays,
    // The end date is in the past → the trip is over. Compare on local day keys
    // so an end date of "today" is still a running trip, not a finished one.
    isFinished: !!trip.endDate && trip.endDate < localDayKey(today),
  };
}