// Country aggregation for the Statistics sub-pages.
//
// Keyed by ISO country CODE (never by the display label): `countryLabel()`
// returns "🇯🇵 Japan", so deriving a flag from the label returns '' and grouping
// on it would split one country across two rows.
//
// Pure module — no React, no DB. `scripts/test-stats-utils.mjs` compiles and
// asserts it without a native module.

import type { Expense } from '../types';
import { toHomeCurrency } from './currency';
import { countryName, flagEmoji } from '../data/countries';
import { expenseDay, inPeriod, type PeriodPreset, type PeriodRange } from './periods';
import { filterExpensesByTrips } from './tripFilter';

export interface CountryRow {
  /** ISO 3166-1 alpha-2. */
  code: string;
  name: string;
  flag: string;
  /** Number of DISTINCT trips that have an expense in this country. */
  trips: number;
  /** Number of DISTINCT local days with an expense in this country. */
  days: number;
  amount: number;
  /** Share of the filtered total, 0..1. */
  pct: number;
}

export interface StatsFilter {
  /** Empty = every trip. */
  tripIds?: string[];
  range?: PeriodRange;
  /** ISO country code. */
  country?: string;
  /**
   * Exact category names. Several names = OR (any of them). Undefined or an
   * EMPTY array = every category, so the caller can hold an array in state
   * without a special case.
   */
  categories?: string[];
}

/**
 * Filter an expense list by trip / period / country / category.
 * ONE place owns this so the countries page, the over-time page and the
 * preview on the Statistics tab can never disagree about what "filtered" means.
 */
export function filterStatsExpenses(expenses: Expense[], f: StatsFilter): Expense[] {
  let list = f.tripIds?.length ? filterExpensesByTrips(expenses, f.tripIds) : expenses;
  if (f.country) list = list.filter((e) => e.country === f.country);
  if (f.categories?.length) {
    const wanted = new Set(f.categories);
    list = list.filter((e) => wanted.has(e.category));
  }
  if (f.range) {
    list = list.filter((e) => inPeriod(expenseDay(e.createdAt, e.rateDate), f.range as PeriodRange));
  }
  return list;
}

export function groupByCountry(expenses: Expense[], f: StatsFilter = {}): CountryRow[] {
  const filtered = filterStatsExpenses(expenses, f);

  const map = new Map<string, { amount: number; trips: Set<string>; days: Set<string> }>();
  for (const e of filtered) {
    if (!e.country) continue;
    const code = e.country.toUpperCase();
    const entry = map.get(code) ?? { amount: 0, trips: new Set<string>(), days: new Set<string>() };
    entry.amount += toHomeCurrency(e);
    if (e.tripId) entry.trips.add(e.tripId);
    entry.days.add(expenseDay(e.createdAt, e.rateDate));
    map.set(code, entry);
  }

  const total = filtered.reduce((s, e) => s + (e.country ? toHomeCurrency(e) : 0), 0);

  return Array.from(map.entries())
    .map(([code, v]) => ({
      code,
      name: countryName(code),
      flag: flagEmoji(code),
      trips: v.trips.size,
      days: v.days.size,
      amount: v.amount,
      pct: total > 0 ? v.amount / total : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Totals for a summary block: DISTINCT trips and DISTINCT local days in the
 * filtered set. NOT the sum of each country row's `days` — a travel day with an
 * expense in two countries appears in both rows, so summing would double-count.
 */
export function summarizeStats(expenses: Expense[], f: StatsFilter = {}): { trips: number; days: number } {
  const trips = new Set<string>();
  const days = new Set<string>();
  for (const e of filterStatsExpenses(expenses, f)) {
    if (e.tripId) trips.add(e.tripId);
    days.add(expenseDay(e.createdAt, e.rateDate));
  }
  return { trips: trips.size, days: days.size };
}

export type CountrySort = 'high' | 'low' | 'az';
/** Rank numbers are positional, so sorting must never mutate the source array. */
export function sortCountries(rows: CountryRow[], sort: CountrySort): CountryRow[] {
  const copy = rows.slice();
  if (sort === 'high') return copy.sort((a, b) => b.amount - a.amount);
  if (sort === 'low') return copy.sort((a, b) => a.amount - b.amount);
  return copy.sort((a, b) => a.name.localeCompare(b.name));
}

export function searchCountries(rows: CountryRow[], query: string): CountryRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q));
}
