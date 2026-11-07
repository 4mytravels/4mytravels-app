// Shared CSV import — ONE implementation for every entry point.
//
// Two callers: Settings → "Import from CSV" (pick a file, optionally into an
// existing trip) and the web share target (Delen → 4MyTravels, always auto).
// Keeping the arithmetic here means the two paths can never drift — the same
// reason computeTripStats() owns the pace math.
import { randomUUID } from 'expo-crypto';
import type { Expense, Trip } from '../types';
import {
  parseCsv,
  isOwnExpenseCsv,
  looksLikeTravelSpendCsv,
  parseOwnCsv,
  parseTravelSpendCsv,
  type ParsedExpense,
} from './csv';
import { saveExpense } from '../db/expenseRepo';
import { saveTrip } from '../db/tripRepo';
import { useTripStore } from '../store/tripStore';

/** Sentinel for the auto mode: no target trip, create one from the file. */
export const AUTO_TRIP = '__auto__';

/**
 * Next free "import-tripN" number, derived from the trips that already exist.
 *
 * A React state counter was wrong: it resets on every remount, so a second
 * import produced a second "import-trip1". Existing names are the single source
 * of truth — gaps are never filled, so deleting "import-trip2" leaves
 * "import-trip3" next (harmless; the old name would otherwise be reused).
 */
export function nextImportTripNumber(trips: { name: string }[]): number {
  const max = trips.reduce((acc, t) => {
    const m = /^import-trip(\d+)$/.exec(t.name.trim());
    return m ? Math.max(acc, parseInt(m[1], 10)) : acc;
  }, 0);
  return max + 1;
}

export interface CsvImportResult {
  count: number;
  tripName: string;
  /** " (3 rows skipped)" or '' — appended to the user-facing message. */
  skippedNote: string;
}

/**
 * Import a CSV export into the database.
 *
 * @param text          the file's text content
 * @param opts.targetTripId  a trip id, or AUTO_TRIP / null to create a trip
 *                           from the file's own dates and trip_name.
 */
export async function importExpensesFromCsv(
  text: string,
  opts: { targetTripId?: string | null } = {},
): Promise<CsvImportResult> {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('File appears to be empty.');
  const header = rows[0];

  // Parse WITHOUT a real trip id first — the auto mode needs the file's own
  // trip name and date range before it can create the trip.
  let items: ParsedExpense[];
  let skippedNote = '';
  if (isOwnExpenseCsv(header)) {
    items = parseOwnCsv(rows, AUTO_TRIP);
  } else if (looksLikeTravelSpendCsv(header)) {
    const res = parseTravelSpendCsv(rows, AUTO_TRIP);
    items = res.items;
    skippedNote = res.skipped > 0 ? ` (${res.skipped} rows skipped)` : '';
  } else {
    throw new Error(
      'Unrecognized CSV format — expected a 4MyTravels or compatible travel expense export.',
    );
  }
  if (items.length === 0) throw new Error('No expense rows found in the file.');

  const trips = useTripStore.getState().trips;
  const target = opts.targetTripId ?? null;
  const isAuto = !target || target === AUTO_TRIP;

  let tripId: string;
  let tripName: string;
  if (isAuto) {
    // Date range from the expense dates.
    const days = items
      .map((i) => (i.createdAt || i.rateDate || '').slice(0, 10))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();
    const startDate = days[0] ?? new Date().toISOString().slice(0, 10);
    const endDate = days[days.length - 1] ?? startDate;

    const headerLower = header.map((h) => h.trim().toLowerCase());
    const nameIdx = headerLower.indexOf('trip_name');
    const nameFromFile = nameIdx >= 0
      ? (rows.slice(1).map((r) => (r[nameIdx] ?? '').trim()).find((v) => v !== '') ?? '')
      : '';
    tripName = nameFromFile || `import-trip${nextImportTripNumber(trips)}`;

    const homeIdx = headerLower.indexOf('home_currency');
    const homeCurrency = homeIdx >= 0
      ? ((rows.slice(1).map((r) => (r[homeIdx] ?? '').trim()).find((v) => v !== '') ?? '') || 'EUR').toUpperCase()
      : 'EUR';

    const trip: Trip = {
      id: randomUUID(),
      name: tripName,
      startDate,
      endDate: endDate !== startDate ? endDate : undefined,
      homeCurrency,
      defaultCurrency: homeCurrency,
      // No budget known from a CSV → 0 keeps the pace math honest instead of
      // inventing one.
      dailyBudget: 0,
      countries: [],
    };
    await saveTrip(trip);
    useTripStore.getState().addTrip(trip);
    tripId = trip.id;
  } else {
    tripId = target;
    tripName = trips.find((t) => t.id === target)?.name ?? '';
  }

  let count = 0;
  for (const item of items) {
    const expense: Expense = {
      ...item,
      id: item.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      tripId,
    } as Expense;
    // INSERT OR REPLACE → re-importing the same file updates instead of duplicating.
    await saveExpense(expense);
    count++;
  }

  return { count, tripName, skippedNote };
}
