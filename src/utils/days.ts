// Human day labels for expense-list grouping ("Today", "Yesterday",
// "Tomorrow", otherwise "28 Aug 2026"). All comparisons use local calendar
// days — an expense entered in another timezone must stay on the day the user
// picked, so we compare YYYY-MM-DD strings, not timestamps.

import { toHomeCurrency } from './currency';

export type DayLabel = 'Today' | 'Yesterday' | 'Tomorrow' | string;

function toLocalYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

const YMD_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const HM_RE = /^(\d{1,2}):(\d{1,2})/;

/**
 * A calendar day as a Date at LOCAL noon. Build it from numeric components:
 * `new Date('2026-10-17T12:00:00')` is an offset-less ISO form, and the two JS
 * engines we ship on do not have to agree on how to read it — the native build
 * (Hermes) then resolved it against the wrong zone, so a "today" computed on the
 * device landed on the server's day. Components are unambiguous everywhere.
 */
export function localNoon(ymd?: string): Date {
  const m = YMD_RE.exec((ymd ?? '').slice(0, 10));
  if (!m) return new Date();
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), 12, 0, 0, 0);
}

/**
 * The UTC instant for "this calendar day at this wall-clock time ON THE DEVICE".
 *
 * Always build the Date from components. `new Date(`${date}T${time}:00`)` leaves
 * the string's timezone to the engine, which is where the native app ended up
 * saving the server's time instead of the phone's: an expense entered at 20:15
 * in UTC+2 was stored as 20:15 UTC, so it sorted and bucketed like a 22:15
 * entry. Seconds/ms are passed in so two expenses saved in the same minute keep
 * their entry order (the old code hard-coded :00.000, so same-minute rows tied
 * and the list fell back to a random uuid tiebreak).
 */
export function localDateTimeISO(
  ymd: string,
  hhmm: string,
  seconds = 0,
  ms = 0,
): string {
  const d = localNoon(ymd);
  const hm = HM_RE.exec(hhmm ?? '');
  d.setHours(
    hm ? parseInt(hm[1], 10) : 0,
    hm ? parseInt(hm[2], 10) : 0,
    seconds,
    ms,
  );
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/**
 * Local wall-clock "HH:mm" for a stored UTC instant. NEVER `.slice(11, 16)` on
 * the ISO string — that is the UTC time-of-day, so an expense saved at 20:15 in
 * UTC+2 was shown as "18:15" in the edit form and every re-save shifted it
 * further away from the moment it happened.
 */
export function localTimeHM(iso?: string): string {
  const t = Date.parse(iso ?? '');
  const d = Number.isNaN(t) ? new Date() : new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "YYYY-MM-DD" for a Date, in the DEVICE's timezone. */
export function toLocalDayKey(d: Date = new Date()): string {
  return toLocalYMD(d);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Split an ISO yyyy-mm-dd into its parts + a "14 Sep 2026" label. */
function ymdParts(iso?: string): { y: number; m: number; d: number; label: string } | null {
  const bits = (iso ?? '').slice(0, 10).split('-');
  const [y, m, d] = bits.map((n) => parseInt(n, 10));
  if (!y || !m || m < 1 || m > 12 || !d) return null;
  return { y, m, d, label: `${d} ${MONTHS[m - 1]} ${y}` };
}

/**
 * Trip date range for a card: "14 Sep – 11 Oct 2026", same month collapsed to
 * "14–18 Sep 2026", no end date reads "14 Sep 2026 – open". Purely string
 * based — a date here is a calendar day, never a timestamp to convert.
 */
export function formatDateRange(startISO?: string, endISO?: string): string {
  const s = ymdParts(startISO);
  if (!s) return startISO ?? '';
  const e = ymdParts(endISO);
  if (!e) return `${s.label} – open`;
  if (s.y === e.y && s.m === e.m) return `${s.d}–${e.d} ${MONTHS[e.m - 1]} ${e.y}`;
  if (s.y === e.y) return `${s.d} ${MONTHS[s.m - 1]} – ${e.d} ${MONTHS[e.m - 1]} ${e.y}`;
  return `${s.d} ${MONTHS[s.m - 1]} ${s.y} – ${e.d} ${MONTHS[e.m - 1]} ${e.y}`;
}

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
    .map(([day, data]) => ({
      day,
      label: friendlyDayLabel(day),
      data: data
        .slice()
        .sort((x, y) => {
          const xc = x.createdAt || x.rateDate;
          const yc = y.createdAt || y.rateDate;
          if (xc !== yc) return xc < yc ? 1 : -1;
          const xi = (x as Record<string, string | undefined>).id;
          const yi = (y as Record<string, string | undefined>).id;
          return (xi || '').localeCompare(yi || '');
        }),
    }));
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
  T extends { id: string; createdAt?: string; rateDate: string; amount: number; currency: string; rateToHome: number },
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
      // SplitShare is expressed in the TRIP HOME currency (like toHomeCurrency)
      // so day-totals and trip-totals sum correctly. The per-row UI converts it
      // back to the expense's own currency for display.
      const homeTotal = toHomeCurrency(e);
      const perDay = Math.floor((homeTotal / days) * 100) / 100;
      const allocated = perDay * days;
      const remainder = Math.round((homeTotal - allocated) * 100) / 100;
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
    .map(([day, data]) => ({
      day,
      label: friendlyDayLabel(day),
      data: data
        .slice()
        .sort((x, y) => {
          const xc = x.expense.createdAt || x.expense.rateDate;
          const yc = y.expense.createdAt || y.expense.rateDate;
          if (xc !== yc) return xc < yc ? 1 : -1;
          return x.expense.id.localeCompare(y.expense.id);
        }),
    }));
}
