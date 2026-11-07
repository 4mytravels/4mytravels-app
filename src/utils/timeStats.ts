// Period aggregation for the Statistics "Over time" sub-page.
//
// Pure module — no React, no DB.

import type { Expense } from '../types';
import { toHomeCurrency } from './currency';
import { expenseDay, inPeriod, type PeriodRange } from './periods';
import { filterStatsExpenses, type StatsFilter } from './countryStats';

export type TimePeriod = 'month' | 'quarter' | 'year';

export interface TimeRow {
  key: string;
  label: string;
  value: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function periodKey(day: string, period: TimePeriod): string {
  if (period === 'year') return day.slice(0, 4);
  if (period === 'quarter') return `${day.slice(0, 4)}-Q${Math.ceil(Number(day.slice(5, 7)) / 3)}`;
  return day.slice(0, 7);
}

export function periodLabelOf(key: string, period: TimePeriod): string {
  if (period === 'year') return key;
  if (period === 'quarter') {
    const [y, q] = key.split('-Q');
    return `${y} Q${q}`;
  }
  const [y, m] = key.split('-');
  const idx = Number(m) - 1;
  return MONTHS[idx] ? `${MONTHS[idx]} ${y}` : key;
}

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Long, unambiguous label for a period — used by lists that render the period
 * OUTSIDE its own axis context (the "Top periods" rows, where "Oct'24" or
 * "2024-Q4'Q4" means nothing). Month: "October 2024"; quarter: "2024 - Q4";
 * year: "2024".
 */
export function periodLabelLong(key: string, period: TimePeriod): string {
  if (period === 'year') return key;
  if (period === 'quarter') {
    const [y, q] = key.split('-Q');
    return `${y} - Q${q}`;
  }
  const [y, m] = key.split('-');
  const idx = Number(m) - 1;
  return MONTHS_LONG[idx] ? `${MONTHS_LONG[idx]} ${y}` : key;
}

/** Next key in sequence — used to fill gaps with 0 so the chart has no holes. */
function nextKey(key: string, period: TimePeriod): string {
  if (period === 'year') return String(Number(key) + 1);
  if (period === 'quarter') {
    const [y, q] = key.split('-Q').map(Number);
    return q === 4 ? `${y + 1}-Q1` : `${y}-Q${q + 1}`;
  }
  const [y, m] = key.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/**
 * Group expenses per month / quarter / year, chronologically.
 *
 * `fillGaps` (default true) inserts the empty periods BETWEEN the first and the
 * last bucket with value 0, so a bar chart does not silently skip a month the
 * user spent nothing in. An untouched period BEFORE the first bucket is not
 * invented — an all-time chart must not start at year 0.
 */
export function groupByTime(
  expenses: Expense[],
  opts: StatsFilter & { period: TimePeriod; fillGaps?: boolean },
): TimeRow[] {
  const filtered = filterStatsExpenses(expenses, opts);
  const period = opts.period;

  const totals = new Map<string, number>();
  for (const e of filtered) {
    const key = periodKey(expenseDay(e.createdAt, e.rateDate), period);
    totals.set(key, (totals.get(key) ?? 0) + toHomeCurrency(e));
  }
  if (totals.size === 0) return [];

  const keys = Array.from(totals.keys()).sort();
  const fill = opts.fillGaps ?? true;
  const out: TimeRow[] = [];
  if (!fill) {
    for (const key of keys) out.push({ key, label: periodLabelOf(key, period), value: totals.get(key) ?? 0 });
    return out;
  }

  let cursor = keys[0];
  const last = keys[keys.length - 1];
  // Hard stop so a bad key can never spin forever.
  for (let guard = 0; guard < 2000; guard++) {
    out.push({ key: cursor, label: periodLabelOf(cursor, period), value: totals.get(cursor) ?? 0 });
    if (cursor === last) break;
    cursor = nextKey(cursor, period);
  }
  return out;
}

/** Chronological total for the current filter — the subtitle figure. */
export function timeTotal(rows: TimeRow[]): number {
  return rows.reduce((s, r) => s + r.value, 0);
}

export { inPeriod, type PeriodRange };
