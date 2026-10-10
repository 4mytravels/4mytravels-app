#!/usr/bin/env node
// Regression test for inclusive day counting + pace vs daily average.
//
// Bug (2026-10-03): computePace counted days 0-BASED (Math.round(diff), no +1)
// while computeTripStats counted INCLUSIVELY. So "Over budget" and "Day X of Y"
// disagreed between screens, and on day 1 expected spend was 0 — any logged
// expense instantly read as "over budget".
//
// Contract: the start date is day 1, min 1; pace and the daily average are
// derived from the SAME reference day.
//
// Gebruik:  node scripts/test-trip-days.mjs

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

const cache = mkdtempSync(join(tmpdir(), '4mt-days-'));
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
    '--outDir', cache,
    'src/types/index.ts',
    'src/utils/pace.ts',
    'src/utils/currency.ts',
    'src/utils/days.ts',
    'src/utils/tripStats.ts',
  ], { cwd: root, stdio: 'pipe' });
} catch (e) {
  console.error('Kon utils niet compileren:', e.stderr?.toString() ?? e.message);
  process.exit(1);
}

const { computePace, inclusiveDays, formatDayProgress, dayProgressRatio } = require(join(cache, 'utils', 'pace.js'));
const { computeTripStats } = require(join(cache, 'utils', 'tripStats.js'));
const { formatMoney, formatMoneyWhole } = require(join(cache, 'utils', 'currency.js'));
const { formatDateRange } = require(join(cache, 'utils', 'days.js'));

const trip = {
  id: 't1', name: 'Japan', startDate: '2026-09-01', endDate: '2026-09-10',
  homeCurrency: 'EUR', defaultCurrency: 'EUR', dailyBudget: 100, countries: ['JP'],
};
const exp = (day, amount, rate = 1) => ({
  id: 'e' + day, tripId: 't1', amount, currency: 'EUR', rateToHome: rate,
  rateDate: day, category: 'Food', createdAt: `${day}T12:00:00`, paymentMethod: 'card',
});

// ---- inclusiveDays ----
assert(inclusiveDays('2026-09-01', '2026-09-01') === 1, 'zelfde dag = 1 dag');
assert(inclusiveDays('2026-09-01', '2026-09-02') === 2, 'twee dagen = 2 dagen');
assert(inclusiveDays('2026-09-01', '2026-09-10') === 10, '1 t/m 10 sept = 10 dagen');
assert(inclusiveDays('2026-09-10', '2026-09-01') === 1, 'omgekeerde datums = minimum 1');

// ---- pace is inclusive, and day 1 is NOT automatically over budget ----
const p1 = computePace({ dailyBudget: 100, tripStartDate: '2026-09-01', tripEndDate: '2026-09-10', today: new Date('2026-09-01T10:00:00'), cumulativeActualSpend: 50 });
assert(p1.daysElapsed === 1, 'dag 1 van de reis = Day 1 (got ' + p1.daysElapsed + ')');
assert(p1.expectedSpend === 100, 'verwachte uitgave op dag 1 = 1 dag budget (got ' + p1.expectedSpend + ')');
assert(p1.status === 'on_track', '50 van 100 op dag 1 = on track (niet over budget)');

const p4 = computePace({ dailyBudget: 100, tripStartDate: '2026-09-01', tripEndDate: '2026-09-10', today: new Date('2026-09-04T10:00:00'), cumulativeActualSpend: 500 });
assert(p4.daysElapsed === 4, 'dag 4 = Day 4 (got ' + p4.daysElapsed + ')');
assert(p4.expectedSpend === 400, 'verwachte uitgave op dag 4 = 400 (got ' + p4.expectedSpend + ')');
assert(p4.status === 'over_budget', '500 op dag 4 = over budget');
assert(computePace({ dailyBudget: 100, tripStartDate: '2026-09-01', tripEndDate: '2026-09-10', today: new Date('2026-09-04T10:00:00'), cumulativeActualSpend: 300 }).status === 'on_track',
  '300 op dag 4 = nog op schema (verwacht 400)');
assert(p4.projectedTotalBudget === 1000, 'verwacht totaal = 1000 (10 dagen)');

// ---- past trip: reference = end date ----
const pPast = computePace({ dailyBudget: 100, tripStartDate: '2026-09-01', tripEndDate: '2026-09-05', today: new Date('2026-09-20T10:00:00'), cumulativeActualSpend: 250 });
assert(pPast.daysElapsed === 5, 'verleden reis telt tot einddatum = 5 (got ' + pPast.daysElapsed + ')');

// ---- active trip capped at the end date ----
const pCap = computePace({ dailyBudget: 100, tripStartDate: '2026-09-01', tripEndDate: '2026-09-04', today: new Date('2026-09-20T10:00:00'), cumulativeActualSpend: 250 });
assert(pCap.daysElapsed === 4, 'actieve reis blijft op einddatum (got ' + pCap.daysElapsed + ')');

// ---- pace and daily average share ONE day count (the actual bug) ----
const today = new Date('2026-09-04T10:00:00');
const expenses = [exp('2026-09-02', 500), exp('2026-09-04', 300)];
const s = computeTripStats(trip, expenses, today);
assert(s.daysActive === 4, 'stats: 4 verstreken dagen (got ' + s.daysActive + ')');
assert(s.pace.daysElapsed === s.daysActive,
  'stats: pace.daysElapsed === daysActive (got ' + s.pace.daysElapsed + ' vs ' + s.daysActive + ')');
assert(s.cumulativeBudget === trip.dailyBudget * s.daysActive,
  'stats: cumulatief budget = dagbudget x dagen (got ' + s.cumulativeBudget + ' vs ' + trip.dailyBudget * s.daysActive + ')');
assert(s.dailyAverage === s.elapsedTotal / s.daysActive, 'stats: daily avg = elapsedTotal / dagen');
assert(s.pace.expectedSpend === s.cumulativeBudget, 'stats: verwachte uitgave === cumulatief budget');

// ---- "Day X of Y" vs "N days" for a finished trip -------------------------
const running = computeTripStats(trip, expenses, new Date('2026-09-04T10:00:00'));
assert(running.totalDays === 10, 'actieve reis: totalDays = 10 (got ' + running.totalDays + ')');
assert(running.isFinished === false, 'actieve reis: niet afgerond');
assert(formatDayProgress({ daysElapsed: 4, totalDays: running.totalDays, isFinished: running.isFinished }) === 'Day 4 of 10',
  'actieve reis toont "Day 4 of 10" (got ' + formatDayProgress({ daysElapsed: 4, totalDays: running.totalDays, isFinished: running.isFinished }) + ')');

const finished = computeTripStats(trip, expenses, new Date('2026-09-20T10:00:00'));
assert(finished.isFinished === true, 'verleden reis: afgerond');
assert(formatDayProgress({ daysElapsed: 10, totalDays: finished.totalDays, isFinished: finished.isFinished }) === '10 days',
  'afgeronde reis toont "10 days" (got ' + formatDayProgress({ daysElapsed: 10, totalDays: finished.totalDays, isFinished: finished.isFinished }) + ')');

// An imported trip with an end date far in the past used to show "Day 75".
const longPast = { ...trip, startDate: '2020-01-01', endDate: '2020-03-15' };
const pastStats = computeTripStats(longPast, [], new Date('2026-09-20T10:00:00'));
assert(pastStats.daysActive === 75, 'verleden lange reis: 75 dagen (got ' + pastStats.daysActive + ')');
assert(formatDayProgress({ daysElapsed: pastStats.pace.daysElapsed, totalDays: pastStats.totalDays, isFinished: pastStats.isFinished }) === '75 days',
  'import-reis toont "75 days", NIET "Day 75" (got ' + formatDayProgress({ daysElapsed: pastStats.pace.daysElapsed, totalDays: pastStats.totalDays, isFinished: pastStats.isFinished }) + ')');

// A one-day trip must use the singular.
assert(formatDayProgress({ daysElapsed: 1, totalDays: 1, isFinished: true }) === '1 day', '1 dag → "1 day"');
assert(formatDayProgress({ daysElapsed: 1, totalDays: undefined, isFinished: false }) === 'Day 1', 'open reis zonder einddatum → "Day 1"');

// End date today still counts as running.
const endsToday = computeTripStats({ ...trip, endDate: '2026-09-20' }, [], new Date('2026-09-20T10:00:00'));
assert(endsToday.isFinished === false, 'einddatum = vandaag telt nog als lopend');

// ---- formatting is en-US again ----
assert(/^[^0-9]*1,234\.56/.test(formatMoney(1234.56, 'EUR')),
  'en-US: komma voor centen, punt voor duizenden → ' + formatMoney(1234.56, 'EUR'));
// The Dutch order was "€ 1.234,56": a dot followed by exactly 3 digits and
// then a comma. In en-US that pattern must be gone.
assert(!/\d\.\d{3},\d{2}\b/.test(formatMoney(1234.56, 'EUR')),
  'geen Nederlandse punt-comma-volgorde meer: ' + formatMoney(1234.56, 'EUR'));
assert(/1,234\.56/.test(formatMoney(1234.56, 'EUR')),
  'en-US volgorde: duizenden-comma, centen-punt → ' + formatMoney(1234.56, 'EUR'));
assert(/^[^0-9]*1,235$/.test(formatMoneyWhole(1234.56, 'EUR')),
  'hele euro zonder centen: ' + formatMoneyWhole(1234.56, 'EUR'));
assert(/^[^0-9]*35,000$/.test(formatMoneyWhole(35000, 'JPY')),
  'JPY duizenden met komma: ' + formatMoneyWhole(35000, 'JPY'));

// ---- full trip budget vs budget-to-date --------------------------------
// User request: a 28-day trip on day 21 must show the 28-day budget, not the
// day-21 one. `totalSpend / budget` uses tripBudget (whole trip); the pace /
// progress bar keeps using the to-date budget.
const longTrip = { ...trip, startDate: '2026-09-01', endDate: '2026-09-28' };
const day21 = computeTripStats(longTrip, [], new Date('2026-09-21T10:00:00'));
assert(day21.totalDays === 28, 'lange reis: totalDays = 28 (got ' + day21.totalDays + ')');
assert(day21.daysActive === 21, 'lange reis: daysActive = 21 (got ' + day21.daysActive + ')');
assert(day21.cumulativeBudget === 2100, 'tot-datum budget = 21 x 100 (got ' + day21.cumulativeBudget + ')');
assert(day21.tripBudget === 2800, 'totaal reisbudget = 28 x 100, NIET 2100 (got ' + day21.tripBudget + ')');
assert(day21.tripBudget > day21.cumulativeBudget, 'totaal reisbudget > budget tot datum');
assert(running.tripBudget === 1000, 'actieve reis: tripBudget = volledige reis (got ' + running.tripBudget + ')');
const openEnded = computeTripStats({ ...trip, endDate: undefined }, expenses, today);
assert(openEnded.tripBudget === openEnded.cumulativeBudget,
  'open reis zonder einddatum: tripBudget valt terug op budget tot datum (got ' + openEnded.tripBudget + ')');

// ---- trip date range on the photo card --------------------------------
// The card shows a friendly range instead of two raw ISO dates.
assert(formatDateRange('2026-09-14', '2026-10-11') === '14 Sep – 11 Oct 2026',
  'datumreeks over twee maanden: ' + formatDateRange('2026-09-14', '2026-10-11'));
assert(formatDateRange('2026-09-14', '2026-09-18') === '14–18 Sep 2026',
  'zelfde maand klapt samen: ' + formatDateRange('2026-09-14', '2026-09-18'));
assert(formatDateRange('2026-12-28', '2027-01-03') === '28 Dec 2026 – 3 Jan 2027',
  'over de jaargrens: ' + formatDateRange('2026-12-28', '2027-01-03'));
assert(formatDateRange('2026-09-14', '2026-11-02') === '14 Sep – 2 Nov 2026',
  'zelfde jaar, andere maand: ' + formatDateRange('2026-09-14', '2026-11-02'));
assert(formatDateRange('2026-09-14') === '14 Sep 2026 – open',
  'zonder einddatum: ' + formatDateRange('2026-09-14'));
assert(formatDateRange('2026-09-14T00:00:00.000Z', '2026-09-20T00:00:00.000Z') === '14–20 Sep 2026',
  'ISO-datetime wordt op de dagnaam geknipt: ' + formatDateRange('2026-09-14T00:00:00.000Z', '2026-09-20T00:00:00.000Z'));
assert(formatDateRange('geen-datum', '') === 'geen-datum',
  'onparseerbare waarde valt terug op de ruwe string: ' + formatDateRange('geen-datum', ''));

// ---- day bar on the trip card (day progress, not money) ----------------
// User rule: "dag 7 van de 14 staat de balk op de helft".
assert(dayProgressRatio(7, 14) === 0.5, 'dag 7 van 14 → balk op de helft (got ' + dayProgressRatio(7, 14) + ')');
assert(dayProgressRatio(1, 4) === 0.25, 'dag 1 van 4 → kwart');
assert(dayProgressRatio(14, 14) === 1, 'laatste dag → volle balk');
assert(dayProgressRatio(0, 14) === 0, 'nog niet begonnen → lege balk');
assert(dayProgressRatio(20, 14) === 1, 'meer dagen dan de reis lang is → afgekapt op 1');
assert(dayProgressRatio(3, undefined) === 0, 'open reis zonder einddatum → geen dagbalk');
assert(dayProgressRatio(3, 0) === 0, 'totalDays 0 → 0 (geen deling door nul)');
assert(dayProgressRatio(-2, 10) === 0, 'negatief → 0');

rmSync(cache, { recursive: true, force: true });
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILURE(S)`);
process.exit(failed === 0 ? 0 : 1);