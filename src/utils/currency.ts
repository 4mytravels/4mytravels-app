// Currency conversion helpers (MVP scope §2.2).
//
// Every expense stores an applied exchange rate + rate date snapshot at entry
// time. Later rate refreshes NEVER retroactively change recorded amounts — the
// stored snapshot makes every converted amount auditable after the fact.

/** Convert `amount` in `from` currency to `home` currency using a rates map. */
export function convert(amount: number, from: string, home: string, rates: Record<string, number>): number {
  if (from === home) return amount;
  const rateFrom = rates[from];
  const rateHome = rates[home];
  if (!rateFrom || !rateHome) throw new Error(`Missing rate for ${from} or ${home}`);
  // rates are relative to the same base; cross-rate = rateHome / rateFrom
  return amount * (rateHome / rateFrom);
}

/**
 * Display locale: en-US.
 *
 * The user asked to revert the nl-NL change from 2026-10-03: en-US is the
 * international default, so amounts read the same regardless of the device
 * locale ("€1,234.56", "¥35,000"). Formatted via Intl, so the decimal/thousands
 * symbols are still correct per currency — only the separator positions are
 * fixed to the US convention.
 */
export const DISPLAY_LOCALE = 'en-US';

/** Format a number as currency for display (no symbol assumptions). */
export function formatMoney(amount: number, currency: string, locale = DISPLAY_LOCALE): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/**
 * Format rounded to whole currency units (no cents) — used for the trip
 * "Total spend" figures where the cents only add noise.
 */
export function formatMoneyWhole(amount: number, currency: string, locale = DISPLAY_LOCALE): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency}`;
  }
}

/**
 * Convert an Expense's own-currency amount into the trip home currency using the
 * RATE SNAPSHOT stored at entry time. Later rate refreshes NEVER change this —
 * the snapshot makes every converted amount auditable (MVP scope §2.2).
 */
export function toHomeCurrency(expense: { amount: number; rateToHome: number }): number {
  return expense.amount * expense.rateToHome;
}

/** Number of whole days between two YYYY-MM-DD dates (>=0). */
export function daysBetween(startDate: string, endDate: string): number {
  const a = new Date(startDate).getTime();
  const b = new Date(endDate).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}
