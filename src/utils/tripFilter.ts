// Pure helpers for the Statistics trip filter (1 trip, several, or all).
//
// Kept out of the screen so the behaviour is unit-testable without a browser:
// scripts/test-trip-filter.mjs compiles this file and asserts the contract.
//
// Contract:
//  - an EMPTY selection means "all trips" (never "none"),
//  - ids that no longer exist are ignored (a trip deleted while a filter was
//    active must not blank the screen),
//  - the order of the selection is preserved in the label.

type WithTripId = { tripId: string };
type TripLike = { id: string; name: string };

/** Drop ids that no longer match a known trip. */
export function pruneTripIds(selected: string[], trips: TripLike[]): string[] {
  const known = new Set(trips.map((t) => t.id));
  return selected.filter((id) => known.has(id));
}

/** Filter expenses to the selected trips; an empty selection = every expense. */
export function filterExpensesByTrips<T extends WithTripId>(
  expenses: T[],
  selected: string[],
): T[] {
  if (selected.length === 0) return expenses;
  const wanted = new Set(selected);
  return expenses.filter((e) => wanted.has(e.tripId));
}

/** "All trips" / "Japan 2026" / "Japan + Bali" / "3 trips". */
export function tripFilterLabel(selected: string[], trips: TripLike[]): string {
  if (selected.length === 0) return 'All trips';
  const names = selected.map((id) => trips.find((t) => t.id === id)?.name ?? '—');
  if (names.length === 1) return names[0];
  if (names.length === 2) return names.join(' + ');
  return `${names.length} trips`;
}

/**
 * M10: compact chip label — "All trips" / "Japan" / "Japan +2". The first name
 * follows the selection order, so the trip the user picked first leads.
 */
export function tripFilterShortLabel(selected: string[], trips: TripLike[]): string {
  if (selected.length === 0) return 'All trips';
  const first = trips.find((t) => t.id === selected[0])?.name ?? '—';
  return selected.length === 1 ? first : `${first} +${selected.length - 1}`;
}