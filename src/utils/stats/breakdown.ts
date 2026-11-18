// G3: every number on the Stats overview, as pure functions — moved out of
// app/(tabs)/statistics.tsx so scripts/test-stats-utils.mjs can assert them
// (and prove they equal the old inline memo, see the snapshot there).
import type { Expense, Trip } from '../../types';
import { toHomeCurrency } from '../currency';
import { categoryColor } from '../categoryIcons';
import { groupByCountry, summarizeStats, type CountryRow } from '../countryStats';

/** Donut: the top N categories, the rest folded into "Others". */
export const MAX_SLICES = 5;

export interface DonutSlice {
  category: string;
  value: number;
  color: string;
  frac: number;
  startAngle: number;
  endAngle: number;
}

export interface StatsBreakdown {
  /** [category, home-currency total], highest first. */
  catEntries: Array<[string, number]>;
  slices: DonutSlice[];
  total: number;
  countryEntries: CountryRow[];
  maxCountry: number;
  topCountries: CountryRow[];
  cardValue: number;
  cashValue: number;
}

/**
 * Category donut, country preview and card/cash split for the Stats overview.
 * `filtered` is the trip-filtered list; the country preview filters `all` by
 * `tripIds` itself (groupByCountry), exactly like the old screen did.
 */
export function computeBreakdown(
  filtered: Expense[],
  all: Expense[],
  tripIds: string[],
  palette: readonly string[],
): StatsBreakdown {
  const byCategory: Record<string, number> = {};
  for (const e of filtered) {
    byCategory[e.category] = (byCategory[e.category] ?? 0) + toHomeCurrency(e);
  }
  const catEntries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

  const chartEntries = catEntries.slice(0, MAX_SLICES);
  const othersValue = catEntries.slice(MAX_SLICES).reduce((s, [, v]) => s + v, 0);
  if (othersValue > 0) chartEntries.push(['Others', othersValue]);

  const total = catEntries.reduce((s, [, v]) => s + v, 0);

  const slices: DonutSlice[] = [];
  let acc = 0;
  for (let i = 0; i < chartEntries.length; i++) {
    const [category, value] = chartEntries[i];
    const frac = total > 0 ? value / total : 0;
    const startAngle = acc * 360;
    acc += frac;
    slices.push({ category, value, // App-wide category colour (same as the row circles); only the
      // synthetic "Others" slice takes the palette's last (grey) entry.
      color: category === 'Others' ? palette[palette.length - 1] : categoryColor(category), frac, startAngle, endAngle: acc * 360 });
  }

  const countryEntries = groupByCountry(all, { tripIds });
  const maxCountry = countryEntries.length ? countryEntries[0].amount : 1;
  const topCountries = countryEntries.slice(0, 5);

  let cardValue = 0;
  let cashValue = 0;
  for (const e of filtered) {
    if (e.paymentMethod === 'card') cardValue += toHomeCurrency(e);
    else cashValue += toHomeCurrency(e);
  }
  return { catEntries, slices, total, countryEntries, maxCountry, topCountries, cardValue, cashValue };
}

/** Quick facts (G1, moved from Home): DISTINCT countries and DISTINCT local days. */
export function quickFacts(filtered: Expense[]): { countries: number; days: number } {
  const countries = new Set(filtered.map((e) => e.country).filter(Boolean)).size;
  return { countries, days: summarizeStats(filtered).days };
}

/** Display currency of the overview: the most-used trip home currency (EUR when none). */
export function pickDisplayCurrency(trips: Array<Pick<Trip, 'homeCurrency'>>): string {
  const counts: Record<string, number> = {};
  for (const t of trips) counts[t.homeCurrency] = (counts[t.homeCurrency] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'EUR';
}

/** Card / cash split as whole percentages + bar fractions. */
export function paymentSplit(cardValue: number, cashValue: number) {
  const total = cardValue + cashValue;
  return {
    cardPct: total > 0 ? Math.round((cardValue / total) * 100) : 0,
    cashPct: total > 0 ? Math.round((cashValue / total) * 100) : 0,
    cardFrac: total > 0 ? cardValue / total : 0,
    cashFrac: total > 0 ? cashValue / total : 0,
  };
}

// ---- Donut geometry (angles in degrees, clockwise from 12 o'clock) ----------

export function donutSlicePath(cx: number, cy: number, outerR: number, innerR: number, startDeg: number, endDeg: number): string {
  const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const s = toRad(startDeg);
  const e = toRad(endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  const x1 = cx + outerR * Math.cos(s);
  const y1 = cy + outerR * Math.sin(s);
  const x2 = cx + outerR * Math.cos(e);
  const y2 = cy + outerR * Math.sin(e);
  const x3 = cx + innerR * Math.cos(e);
  const y3 = cy + innerR * Math.sin(e);
  const x4 = cx + innerR * Math.cos(s);
  const y4 = cy + innerR * Math.sin(s);
  return [
    `M${x1},${y1}`,
    `A${outerR},${outerR} 0 ${largeArc} 1 ${x2},${y2}`,
    `L${x3},${y3}`,
    `A${innerR},${innerR} 0 ${largeArc} 0 ${x4},${y4}`,
    'Z',
  ].join(' ');
}

export function labelPos(cx: number, cy: number, angleDeg: number, r: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
