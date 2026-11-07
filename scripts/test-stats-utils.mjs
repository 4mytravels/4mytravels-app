#!/usr/bin/env node
// Regression test for the Statistics sub-page aggregation utils.
//
// Behaviour under test:
//  - src/utils/periods.ts      — presets, inclusive ranges, LOCAL day key
//  - src/utils/countryStats.ts — grouping by COUNTRY CODE (not by label),
//                                distinct trips, distinct DAYS, share of total,
//                                filtering by trip / country / category,
//                                positional ranking after a sort
//  - src/utils/timeStats.ts    — month/quarter/year buckets, chronological
//                                order, gap filling with 0
//
// Gebruik:  node scripts/test-stats-utils.mjs

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();
const tsc = join(root, 'node_modules', '.bin', 'tsc');

let failed = 0;
function assert(cond, msg) {
  if (cond) console.log('PASS:', msg);
  else { console.error('FAIL:', msg); failed++; }
}
function near(a, b) { return Math.abs(a - b) < 0.0001; }

const cache = mkdtempSync(join(tmpdir(), '4mt-stats-'));
try {
  try { symlinkSync(join(root, 'node_modules'), join(cache, 'node_modules'), 'dir'); } catch { /* best effort */ }
  execFileSync(tsc, [
    '--ignoreConfig',
    '--module', 'commonjs',
    '--target', 'es2020',
    '--moduleResolution', 'node',
    '--esModuleInterop',
    '--skipLibCheck',
    '--ignoreDeprecations', '6.0',
    '--rootDir', 'src',
    '--outDir', cache,
    'src/utils/countryStats.ts',
    'src/utils/timeStats.ts',
  ], { cwd: root, stdio: 'pipe' });
} catch (e) {
  console.error('Kon de stats-utils niet compileren:', e.stderr?.toString() ?? e.message);
  process.exit(1);
}

const periods = require(join(cache, 'utils', 'periods.js'));
const countries = require(join(cache, 'utils', 'countryStats.js'));
const time = require(join(cache, 'utils', 'timeStats.js'));

// --- fixtures --------------------------------------------------------------
// rateToHome 1 → amount is already the home value, so the arithmetic is readable.
const e = (over = {}) => ({
  id: 'x', tripId: 't1', amount: 100, currency: 'EUR', rateToHome: 1,
  rateDate: '2026-08-10', category: 'Food', paymentMethod: 'card', country: 'JP',
  ...over,
});

// --- periods ---------------------------------------------------------------
assert(periods.periodLabel('all') === 'All time', 'preset-label: all');
assert(periods.periodLabel('ytd') === 'This year', 'preset-label: ytd');
assert(periods.periodLabel('last12') === 'Last 12 months', 'preset-label: last12');

const allRange = periods.getPeriodRange('all');
assert(allRange.dateFrom === undefined && allRange.dateTo === undefined,
  'preset "altijd" is ONBEGRENSD (geen stille afkap op vandaag)');
assert(periods.inPeriod('1999-01-01', allRange), 'altijd bevat een oude datum');

const custom = periods.getPeriodRange('custom', '2026-01-01', '2026-01-31');
assert(periods.inPeriod('2026-01-01', custom) && periods.inPeriod('2026-01-31', custom),
  'custom-bereik is INCLUSIEF beide randen');
assert(!periods.inPeriod('2026-02-01', custom), 'custom-bereik sluit februari uit');
assert(!periods.inPeriod('2025-12-31', custom), 'custom-bereik sluit december uit');

const ytd = periods.getPeriodRange('ytd');
assert(/^\d{4}-01-01$/.test(ytd.dateFrom), 'YTD start op 1 januari van dit jaar');
assert(periods.inPeriod(periods.toLocalYmd(new Date()), ytd), 'YTD bevat vandaag');

// A full ISO instant is bucketed on the LOCAL day, not the UTC day.
const localEvening = periods.expenseDay(
  new Date(2026, 7, 10, 23, 30).toISOString(), // 10 Aug 2026 23:30 LOCAL
  '2026-08-10',
);
assert(localEvening === '2026-08-10', 'avond-uitgave blijft op de LOKALE dag (niet UTC)');
assert(periods.expenseDay(undefined, '2026-08-10') === '2026-08-10', 'zonder createdAt: rateDate is de dag');

// --- country grouping ------------------------------------------------------
const list = [
  e({ id: '1', country: 'JP', amount: 100, tripId: 't1', rateDate: '2026-08-01' }),
  e({ id: '2', country: 'JP', amount: 100, tripId: 't1', rateDate: '2026-08-01' }), // same day, same trip
  e({ id: '3', country: 'JP', amount: 100, tripId: 't2', rateDate: '2026-08-02' }),
  e({ id: '4', country: 'GR', amount: 100, tripId: 't1', rateDate: '2026-08-03' }),
  e({ id: '5', country: undefined, amount: 500, tripId: 't1', rateDate: '2026-08-04' }),
];
const byCountry = countries.groupByCountry(list, {});
assert(byCountry.length === 2, 'landen zonder tag tellen niet mee als land (2 landen)');
assert(byCountry[0].code === 'JP' && byCountry[1].code === 'GR', 'gesorteerd op bedrag, JP eerst');
assert(near(byCountry[0].amount, 300), 'JP-totaal = 300');
assert(byCountry[0].name === 'Japan', 'naam komt uit de landentabel: Japan');
assert(byCountry[0].flag === '🇯🇵', 'vlag volgt uit de CODE (niet uit het label)');
assert(byCountry[0].trips === 2, 'JP: 2 unieke reizen');
assert(byCountry[0].days === 2, 'JP: 2 unieke DAGEN (twee rijen op 1 dag = 1 dag)');
assert(near(byCountry[0].pct, 0.75), 'JP = 75% van het gefilterde totaal (300/400)');

// --- summary block scope ("From 4 trips and 231 days") ----------------------
const scopeAll = countries.summarizeStats(list, {});
assert(scopeAll.trips === 2, 'samenvatting: 2 unieke reizen over alles');
assert(scopeAll.days === 4, 'samenvatting: 4 unieke DAGEN — niet de SOM van de landrijen (2+1=3)');
const scopeT1 = countries.summarizeStats(list, { tripIds: ['t1'] });
assert(scopeT1.trips === 1 && scopeT1.days === 3, 'samenvatting volgt het tripfilter (1 reis, 3 dagen)');
const scopeAug3 = countries.summarizeStats(list, { range: periods.getPeriodRange('custom', '2026-08-03', '2026-08-04') });
assert(scopeAug3.trips === 1 && scopeAug3.days === 2, 'samenvatting volgt het periodefilter (3–4 aug = 2 dagen)');
assert(countries.summarizeStats([], {}).days === 0, 'samenvatting zonder uitgaven = 0 dagen');
// Een landrij mag de dag-telling niet opblazen: dit is de bug die de som gaf.
assert(countries.summarizeStats(list, {}).days !== byCountry.reduce((s, r) => s + r.days, 0),
  'dag-telling is DISTINCT, niet de som van per-land-dagen');

const onlyTrips = countries.groupByCountry(list, { tripIds: ['t2'] });
assert(onlyTrips.length === 1 && near(onlyTrips[0].amount, 100), 'trip-filter laat alleen t2 over');
assert(countries.groupByCountry(list, { tripIds: [] }).length === 2, 'lege trip-selectie = ALLE reizen');

const onlyJapan = countries.groupByCountry(list, { country: 'JP' });
assert(onlyJapan.length === 1 && near(onlyJapan[0].pct, 1), 'landfilter: 1 land, 100% van het gefilterde totaal');

const onlyFood = countries.groupByCountry(list, { categories: ['Food'] });
assert(near(onlyFood.reduce((s, r) => s + r.amount, 0), 400), 'categoriefilter telt 400');

// Multi-select: several categories = OR, and an EMPTY array = every category
// (the screens hold an array in state, so "All" must need no special case).
const mixed = [
  e({ id: 'm1', amount: 100, category: 'Food' }),
  e({ id: 'm2', amount: 200, category: 'Transport' }),
  e({ id: 'm3', amount: 400, category: 'Shopping' }),
];
const twoCats = countries.filterStatsExpenses(mixed, { categories: ['Food', 'Shopping'] });
assert(twoCats.length === 2 && near(twoCats.reduce((s, x) => s + x.amount, 0), 500),
  'meerdere categorieën = OR (Food + Shopping = 500)');
assert(countries.filterStatsExpenses(mixed, { categories: [] }).length === 3,
  'lege categorie-selectie = ALLE categorieën');
assert(countries.filterStatsExpenses(mixed, { categories: ['Transport'] }).length === 1,
  'één categorie filtert nog steeds');

const ranged = countries.groupByCountry(list, { range: periods.getPeriodRange('custom', '2026-08-03', '2026-08-04') });
assert(ranged.length === 1 && ranged[0].code === 'GR', 'periodefilter: alleen GR binnen 3–4 aug');

// --- sorting is positional, never in-place ---------------------------------
const unsorted = [
  { code: 'JP', name: 'Japan', flag: '🇯🇵', trips: 1, days: 1, amount: 300, pct: 0.75 },
  { code: 'GR', name: 'Greece', flag: '🇬🇷', trips: 1, days: 1, amount: 100, pct: 0.25 },
];
const sortedAz = countries.sortCountries(unsorted, 'az');
assert(sortedAz[0].name === 'Greece', 'A-Z sorteert op naam');
assert(unsorted[0].name === 'Japan', 'sorteren muteert de bronlijst NIET (rangnummer blijft klopbaar)');
assert(countries.sortCountries(unsorted, 'low')[0].name === 'Greece', 'laag→hoog zet de kleinste eerst');
assert(countries.searchCountries(unsorted, 'gre').length === 1, 'zoeken op naam werkt');
assert(countries.searchCountries(unsorted, 'jp').length === 1, 'zoeken op code werkt');
assert(countries.searchCountries(unsorted, '  ').length === 2, 'lege zoekterm geeft alles terug');

// --- time buckets ----------------------------------------------------------
const timeline = [
  e({ id: 'a', amount: 100, rateDate: '2026-01-15' }),
  e({ id: 'b', amount: 50, rateDate: '2026-01-20' }),
  e({ id: 'c', amount: 200, rateDate: '2026-04-02' }),
];
const months = time.groupByTime(timeline, { period: 'month' });
assert(months.length === 4, 'jan..apr = 4 buckets (maart gevuld met 0)');
assert(months.map((m) => m.key).join(',') === '2026-01,2026-02,2026-03,2026-04', 'chronologisch op key');
assert(near(months[0].value, 150), 'januari = 150');
assert(near(months[1].value, 0), 'lege maand = 0, geen gat in de grafiek');
assert(near(time.timeTotal(months), 350), 'totaal = 350');

const quarters = time.groupByTime(timeline, { period: 'quarter' });
assert(quarters.map((q) => q.key).join(',') === '2026-Q1,2026-Q2', 'kwartalen: Q1 + Q2');
assert(near(quarters[0].value, 150) && near(quarters[1].value, 200), 'Q1 = 150, Q2 = 200');
assert(quarters[1].label === '2026 Q2', 'kwartaal-label leesbaar');

// Top-periods rijen gebruiken het LANGE label (buiten de as-context): een kale
// maandafkorting of "2024-Q4'Q4" zegt daar niets.
assert(time.periodLabelLong('2024-10', 'month') === 'October 2024', 'lang maand-label: October 2024');
assert(time.periodLabelLong('2024-01', 'month') === 'January 2024', 'lang maand-label: January 2024');
assert(time.periodLabelLong('2024-Q4', 'quarter') === '2024 - Q4', 'lang kwartaal-label: 2024 - Q4');
assert(time.periodLabelLong('2024', 'year') === '2024', 'lang jaar-label: 2024');

const years = time.groupByTime([
  ...timeline,
  e({ id: 'd', amount: 400, rateDate: '2025-06-01' }),
], { period: 'year' });
assert(years.map((y) => y.key).join(',') === '2025,2026', 'jaren chronologisch');
assert(near(years[0].value, 400) && near(years[1].value, 350), 'jaartotalen 400 / 350');

assert(time.groupByTime([], { period: 'month' }).length === 0, 'geen data = lege reeks (geen crash)');

// A year boundary must roll the key forward, not backwards.
const decJan = time.groupByTime([
  e({ id: 'x', amount: 10, rateDate: '2025-12-05' }),
  e({ id: 'y', amount: 20, rateDate: '2026-01-05' }),
], { period: 'month' });
assert(decJan.map((m) => m.key).join(',') === '2025-12,2026-01', 'over een jaarwissel blijft de volgorde goed');

const decMar = time.groupByTime([
  e({ id: 'x', amount: 10, rateDate: '2025-11-05' }),
  e({ id: 'y', amount: 20, rateDate: '2026-02-05' }),
], { period: 'quarter' });
assert(decMar.map((q) => q.key).join(',') === '2025-Q4,2026-Q1', 'kwartaal over de jaarwissel: Q4 → Q1');

// Filters apply to time buckets too.
assert(time.groupByTime(timeline, { period: 'month', country: 'JP' }).length === 4,
  'landfilter werkt ook op de tijdreeks');
assert(time.groupByTime(timeline, { period: 'month', categories: ['Nope'] }).length === 0,
  'onbekende categorie geeft een lege reeks');
const catTimeline = [
  e({ id: 'a', amount: 100, rateDate: '2026-01-15', category: 'Food' }),
  e({ id: 'b', amount: 200, rateDate: '2026-02-15', category: 'Transport' }),
];
const bothCats = time.groupByTime(catTimeline, { period: 'month', categories: ['Food', 'Transport'] });
assert(bothCats.map((m) => m.key).join(',') === '2026-01,2026-02' && near(time.timeTotal(bothCats), 300),
  'meerdere categorieën tellen beide maanden mee (OR, 300)');
const foodOnly = time.groupByTime(catTimeline, { period: 'month', categories: ['Food'] });
assert(foodOnly.length === 1 && near(foodOnly[0].value, 100),
  'één categorie op de tijdreeks laat alleen die maand over');

if (failed) {
  console.error(`\n${failed} test(s) gefaald`);
  process.exit(1);
}
console.log('\nAlle stats-utils tests geslaagd.');
rmSync(cache, { recursive: true, force: true });
