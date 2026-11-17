// Which day section the Expenses tab scrolls to when it opens.
//
// Pure helper (no React) so scripts/test-scroll-target.mjs can assert it.
//  - today's section when it exists,
//  - otherwise the section whose day is NEAREST to today (ties go to the
//    PAST day: a future-dated entry is rarer than "yesterday"),
//  - -1 for an empty list (nothing to scroll to).
// Days are local `YYYY-MM-DD` keys, as produced by groupByDaySplitAware.

function dayNumber(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  // Date.UTC: pure calendar arithmetic, no DST/timezone drift.
  return Math.round(Date.UTC(y, (m || 1) - 1, d || 1) / 86400000);
}

export function scrollTargetSection(days: readonly string[], today: string): number {
  if (days.length === 0) return -1;
  const exact = days.indexOf(today);
  if (exact >= 0) return exact;
  const t = dayNumber(today);
  let best = -1;
  let bestDist = Infinity;
  let bestIsPast = false;
  days.forEach((day, i) => {
    const n = dayNumber(day);
    if (!Number.isFinite(n)) return;
    const dist = Math.abs(n - t);
    const isPast = n < t;
    if (dist < bestDist || (dist === bestDist && isPast && !bestIsPast)) {
      best = i;
      bestDist = dist;
      bestIsPast = isPast;
    }
  });
  return best;
}
