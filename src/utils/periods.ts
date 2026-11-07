export type PeriodPreset = 'all' | 'ytd' | 'last12' | 'custom';

export interface PeriodRange {
  preset: PeriodPreset;
  /** YYYY-MM-DD, inclusive. Undefined = unbounded. */
  dateFrom?: string;
  dateTo?: string;
}

/** Resolve a preset into a concrete inclusive date range. */
export function getPeriodRange(preset: PeriodPreset, from?: string, to?: string): PeriodRange {
  if (preset === 'custom') {
    return { preset, dateFrom: from || undefined, dateTo: to || undefined };
  }
  if (preset === 'all') {
    return { preset };
  }
  const today = new Date();
  if (preset === 'ytd') {
    return { preset, dateFrom: `${today.getFullYear()}-01-01`, dateTo: toLocalYmd(today) };
  }
  // last12 = the last 365 days, inclusive of today.
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 364);
  return { preset, dateFrom: toLocalYmd(start), dateTo: toLocalYmd(today) };
}

/** Inclusive test on a YYYY-MM-DD day key. */
export function inPeriod(day: string, range: PeriodRange): boolean {
  if (!range.dateFrom && !range.dateTo) return true;
  if (range.dateFrom && day < range.dateFrom) return false;
  if (range.dateTo && day > range.dateTo) return false;
  return true;
}

export function periodLabel(p: PeriodPreset): string {
  switch (p) {
    case 'all': return 'All time';
    case 'ytd': return 'This year';
    case 'last12': return 'Last 12 months';
    case 'custom': return 'Custom';
  }
}

/**
 * The expense's LOCAL calendar day (YYYY-MM-DD) — the SAME rule `groupByDay`
 * uses (src/utils/days.ts): a full ISO createdAt is converted to the device's
 * timezone (toISOString()/slice(0,10) would give the UTC day, which lags a day
 * behind for evening entries in UTC+ zones); a bare rateDate is already a
 * picked calendar day.
 */
export function expenseDay(createdAt: string | undefined, rateDate: string): string {
  if (createdAt && createdAt.includes('T')) {
    const t = Date.parse(createdAt);
    if (!Number.isNaN(t)) return toLocalYmd(new Date(t));
  }
  return rateDate.slice(0, 10);
}

export function toLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
