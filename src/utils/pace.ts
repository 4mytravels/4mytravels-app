// Pace / budget algorithms (MVP scope §2.2 — "Pace algorithm" + edge cases).
//
// Compares CUMULATIVE ACTUAL spend against CUMULATIVE EXPECTED spend at the
// current day, so a traveller sees pacing ahead/behind BEFORE the trip ends.
//
// DAY COUNTING IS INCLUSIVE EVERYWHERE. Day 1 of a trip is the start date, so
// a trip that started today is "Day 1", not "Day 0". `computePace` used
// `Math.round(diff)` with no `+1` while the rest of the app counted inclusively
// — that is why "Over budget" and "Day X of Y" disagreed between screens, and
// why day 1 always read as "over budget" (expected spend 0 while a real
// expense was already logged).

export type PaceStatus = 'on_track' | 'over_budget';

export interface PaceInput {
  dailyBudget: number; // home currency
  tripStartDate: string; // YYYY-MM-DD
  tripEndDate?: string; // optional (open-ended)
  today: Date;
  cumulativeActualSpend: number; // home currency
  /**
   * Reference day (YYYY-MM-DD) for "days elapsed", inclusive of the start day.
   * Provided by computeTripStats so pace and the daily average can never
   * disagree. Omit to derive it from `today` + `tripEndDate`.
   */
  referenceDate?: string;
}

export interface PaceResult {
  status: PaceStatus;
  dailyBudget: number;
  /** Inclusive day counter: the start date is day 1, min 1. */
  daysElapsed: number;
  expectedSpend: number; // cumulative expected by the reference day
  actualSpend: number;
  projectedTotalBudget?: number; // only when endDate set
  openEnded: boolean;
}

/** Parse YYYY-MM-DD at local noon — avoids UTC off-by-one and DST edges. */
export function parseLocalDay(date: string): Date {
  return new Date(`${date}T12:00:00`);
}

/** Inclusive day count between two YYYY-MM-DD dates (start day = 1, min 1). */
export function inclusiveDays(startDate: string, endDate: string): number {
  const a = parseLocalDay(startDate).getTime();
  const b = parseLocalDay(endDate).getTime();
  if (isNaN(a) || isNaN(b)) return 1;
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

export function computePace(input: PaceInput): PaceResult {
  // Reference day: caller-provided, else derived from today + tripEndDate.
  let referenceDate: string;
  if (input.referenceDate) {
    referenceDate = input.referenceDate;
  } else {
    const todayStart = new Date(input.today);
    todayStart.setHours(12, 0, 0, 0);
    const endMs = input.tripEndDate ? parseLocalDay(input.tripEndDate).getTime() : NaN;
    // Past trip → the end date is the last day that counts.
    // Active/open trip → today. Never the end date: that would count days the
    // traveller has not reached yet.
    referenceDate =
      !Number.isNaN(endMs) && endMs < todayStart.getTime() ? input.tripEndDate! : localDayKey(todayStart);
  }

  const daysElapsed = inclusiveDays(input.tripStartDate, referenceDate);
  const expectedSpend = input.dailyBudget * daysElapsed;
  const status: PaceStatus = input.cumulativeActualSpend > expectedSpend ? 'over_budget' : 'on_track';

  const openEnded = !input.tripEndDate;
  let projectedTotalBudget: number | undefined;
  if (!openEnded && input.tripEndDate) {
    projectedTotalBudget = input.dailyBudget * inclusiveDays(input.tripStartDate, input.tripEndDate);
  }

  return {
    status,
    dailyBudget: input.dailyBudget,
    daysElapsed,
    expectedSpend,
    actualSpend: input.cumulativeActualSpend,
    projectedTotalBudget,
    openEnded,
  };
}

/**
 * Fill ratio (0…1) for the trip card's day bar: the DAY the traveller is on,
 * not the money spent — day 7 of 14 is exactly half. Finished trips sit at 1
 * (their last day), trips without an end date at 0 (nothing to measure against).
 */
export function dayProgressRatio(daysElapsed: number, totalDays?: number): number {
  if (!totalDays || totalDays <= 0) return 0;
  return Math.min(1, Math.max(0, daysElapsed / totalDays));
}

/**
 * "Day 3 of 10" while a trip is running, "10 days" once it has finished.
 *
 * The user found "Day 8 of 8" for an ended 8-day trip confusing, and an imported
 * trip whose end date was far in the past produced a nonsense "Day 75". A
 * finished trip therefore reports the TOTAL number of days, never a running
 * counter. `isFinished` is the caller's decision (see tripStatus helpers), so
 * both screens must pass the same one.
 */
export function formatDayProgress(opts: {
  daysElapsed: number;
  totalDays?: number;
  isFinished: boolean;
}): string {
  const { daysElapsed, totalDays, isFinished } = opts;
  if (isFinished) {
    const total = totalDays ?? daysElapsed;
    return `${total} ${total === 1 ? 'day' : 'days'}`;
  }
  return totalDays ? `Day ${daysElapsed} of ${totalDays}` : `Day ${daysElapsed}`;
}

/** Local YYYY-MM-DD key for a Date (never UTC — a trip day is a local day). */
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---- Multi-day split allocation (§2.2 edge cases) ----
//
// The amount is split evenly across the split's days; rounding remainders are
// assigned to the FINAL day so the daily amounts always sum exactly to total.
// Rules:
//   (a) splitStart must be >= trip.startDate.
//   (b) split days outside the trip date range are still counted in this
//       expense's daily allocation, but EXCLUDED from the trip's total_budget
//       projection.
//   (c) on open-ended trips the split range defines the only period basis for
//       that expense's allocation.

export interface SplitAllocation {
  perDay: number; // base per-day amount (home currency context not applied here)
  finalDayExtra: number; // remainder assigned to the last day
  days: number;
}

export function allocateSplit(total: number, splitStart: string, splitEnd: string): SplitAllocation {
  const days = inclusiveDays(splitStart, splitEnd);
  const perDay = Math.floor((total / days) * 100) / 100;
  const allocated = perDay * days;
  const finalDayExtra = Math.round((total - allocated) * 100) / 100;
  return { perDay, finalDayExtra, days };
}
