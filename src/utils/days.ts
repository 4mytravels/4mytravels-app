// Human day labels for expense-list grouping ("Today", "Yesterday",
// "Tomorrow", otherwise "28 Aug 2026"). All comparisons use local calendar
// days — an expense entered in another timezone must stay on the day the user
// picked, so we compare YYYY-MM-DD strings, not timestamps.

export type DayLabel = 'Today' | 'Yesterday' | 'Tomorrow' | string;

function toLocalYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Today" / "Yesterday" / "Tomorrow" / "28 Aug 2026" for a date-ish value. */
export function friendlyDayLabel(value?: string): string {
  if (!value) return '';
  // Take the calendar day part (ISO datetime or plain date).
  const ymd = value.slice(0, 10);
  const today = toLocalYMD(new Date());
  if (ymd === today) return 'Today';
  const yesterday = toLocalYMD(new Date(Date.now() - 86_400_000));
  if (ymd === yesterday) return 'Yesterday';
  const tomorrow = toLocalYMD(new Date(Date.now() + 86_400_000));
  if (ymd === tomorrow) return 'Tomorrow';

  // Parse safely at midday UTC to avoid DST edge cases.
  const t = Date.parse(`${ymd}T12:00:00Z`);
  if (Number.isNaN(t)) return ymd;
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Group expenses into per-day sections sorted newest-first.
 * The section key is the expense's LOCAL calendar day (createdAt when it is a
 * full ISO datetime with time-of-day; rateDate is the fallback).
 */

export function groupByDay<T extends { createdAt?: string; rateDate: string }>(
  items: T[],
): Array<{ day: string; label: string; data: T[] }> {
  const byDay = new Map<string, T[]>();
  for (const e of items) {
    // Local calendar day: createdAt with a time-of-day is converted to the
    // DEVICE's timezone first (toISOString() would give the UTC day, which
    // lags a day behind for evening entries in UTC+ zones); a bare rateDate
    // is already a picked calendar day and is used as-is.
    let day: string;
    if (e.createdAt && e.createdAt.includes('T')) {
      const t = Date.parse(e.createdAt);
      day = Number.isNaN(t)
        ? e.rateDate.slice(0, 10)
        : (() => {
            const d = new Date(t);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          })();
    } else {
      day = e.rateDate.slice(0, 10);
    }
    const bucket = byDay.get(day);
    if (bucket) bucket.push(e);
    else byDay.set(day, [e]);
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // newest day first
    .map(([day, data]) => ({ day, label: friendlyDayLabel(day), data }));
}

export interface SplitAwareEntry<T> {
  expense: T;
  /** The calendar day this (partial) entry is shown on (YYYY-MM-DD). */
  day: string;
  /**
   * Share of the expense attributed to this day. For multi-day splits this is
   * the even per-day portion; otherwise it's null and the UI should use the
   * expense's full amounts.
   */
  splitShare: number | null;
}

function addDays(ymd: string, n: number): string {
  const t = Date.parse(`${ymd}T12:00:00Z`);
  if (Number.isNaN(t)) return ymd;
  const d = new Date(t + n * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/**
 * Like groupByDay, but multi-day-split expenses are expanded: each covered day
 * gets its own entry with an equal share of the amount (allocateSplit's
 * rounding remainder lands on the last day). Single-day expenses pass through
 * with splitShare === null. Sections sorted newest-first.
 */
export function groupByDaySplitAware<
  T extends { createdAt?: string; rateDate: string; amount: number; currency: string },
>(
  items: T[],
): Array<{ day: string; label: string; data: Array<SplitAwareEntry<T>> }> {
  const byDay = new Map<string, Array<SplitAwareEntry<T>>>();
  const push = (day: string, entry: SplitAwareEntry<T>) => {
    const bucket = byDay.get(day);
    if (bucket) bucket.push(entry);
    else byDay.set(day, [entry]);
  };
  for (const e of items) {
    // Local calendar day of the expense (same rule as groupByDay).
    let baseDay: string;
    if (e.createdAt && e.createdAt.includes('T')) {
      const t = Date.parse(e.createdAt);
      baseDay = Number.isNaN(t)
        ? e.rateDate.slice(0, 10)
        : (() => {
            const d = new Date(t);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          })();
    } else {
      baseDay = e.rateDate.slice(0, 10);
    }
    // Multi-day split? Expand across [rateDate … splitEnd].
    const split = (e as T & { multiDaySplit?: { splitStart: string; splitEnd: string } }).multiDaySplit;
    if (split?.splitStart && split.splitEnd && split.splitEnd > split.splitStart) {
      const start = split.splitStart.slice(0, 10);
      const end = split.splitEnd.slice(0, 10);
      const days = Math.max(
        1,
        Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000) + 1,
      );
      const perDay = Math.floor((e.amount / days) * 100) / 100;
      const allocated = perDay * days;
      const remainder = Math.round((e.amount - allocated) * 100) / 100;
      for (let i = 0; i < days; i++) {
        // Rounding remainder lands on the last day (same as allocateSplit).
        const share = i === days - 1 ? Math.round((perDay + remainder) * 100) / 100 : perDay;
        const day = addDays(start, i);
        push(day, { expense: e, day, splitShare: share });
      }
    } else {
      push(baseDay, { expense: e, day: baseDay, splitShare: null });
    }
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, data]) => ({ day, label: friendlyDayLabel(day), data }));
}
