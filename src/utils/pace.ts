// Pace / budget algorithms (MVP scope §2.2 — "Pace algorithm" + edge cases).
//
// Compares CUMULATIVE ACTUAL spend against CUMULATIVE EXPECTED spend at the
// current day, so a traveller sees pacing ahead/behind BEFORE the trip ends.

export type PaceStatus = 'on_track' | 'over_budget';

export interface PaceInput {
  dailyBudget: number; // home currency
  tripStartDate: string; // YYYY-MM-DD
  tripEndDate?: string; // optional (open-ended)
  today: Date;
  cumulativeActualSpend: number; // home currency
}

export interface PaceResult {
  status: PaceStatus;
  dailyBudget: number;
  daysElapsed: number;
  expectedSpend: number; // cumulative expected by today
  actualSpend: number;
  projectedTotalBudget?: number; // only when endDate set
  openEnded: boolean;
}

export function computePace(input: PaceInput): PaceResult {
  const start = new Date(input.tripStartDate);
  const startMs = isNaN(start.getTime()) ? input.today.getTime() : start.getTime();
  const daysElapsed = Math.max(0, Math.round((input.today.getTime() - startMs) / 86_400_000));
  const expectedSpend = input.dailyBudget * daysElapsed;
  const status: PaceStatus = input.cumulativeActualSpend > expectedSpend ? 'over_budget' : 'on_track';

  const openEnded = !input.tripEndDate;
  let projectedTotalBudget: number | undefined;
  if (!openEnded && input.tripEndDate) {
    const duration = Math.max(1, daysBetween(input.tripStartDate, input.tripEndDate) + 1);
    projectedTotalBudget = input.dailyBudget * duration;
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

// Re-used local helper (kept here to avoid a circular import with currency.ts).
function daysBetween(startDate: string, endDate: string): number {
  return Math.max(0, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000));
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
  const days = Math.max(1, daysBetween(splitStart, splitEnd) + 1);
  const perDay = Math.floor((total / days) * 100) / 100;
  const allocated = perDay * days;
  const finalDayExtra = Math.round((total - allocated) * 100) / 100;
  return { perDay, finalDayExtra, days };
}
