// Pure helpers for the CSV export: one file per trip, deterministic names.
// No RN / DB imports, so scripts/test-csv-export-files.mjs can compile it alone.

export interface ExportTripLike { id: string; name: string; startDate?: string }

/** Filesystem-safe trip name: letters/digits/_/- only, dashes collapsed. */
export function sanitizeFileName(name: string): string {
  const s = (name ?? '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return s || 'trip';
}

/** travelspend_export_<TripName>-<year>.csv (year = trip start year). */
export function csvFileNameForTrip(trip: ExportTripLike, fallbackYear = new Date().getFullYear()): string {
  const m = /^(\d{4})/.exec(trip.startDate ?? '');
  const year = m ? m[1] : String(fallbackYear);
  return `travelspend_export_${sanitizeFileName(trip.name)}-${year}.csv`;
}

export interface CsvFilePlan<T extends ExportTripLike, E> { trip: T; fileName: string; expenses: E[] }

/**
 * Group expenses by trip (trip order kept, trips without expenses dropped) and
 * give every file a UNIQUE name — two trips "Japan" in 2026 become
 * ..._Japan-2026.csv and ..._Japan-2026-2.csv, never an overwrite.
 */
export function planTripCsvFiles<T extends ExportTripLike, E extends { tripId: string }>(
  trips: T[], expenses: E[], fallbackYear?: number,
): CsvFilePlan<T, E>[] {
  const byTrip = new Map<string, E[]>();
  for (const e of expenses) {
    const l = byTrip.get(e.tripId);
    if (l) l.push(e); else byTrip.set(e.tripId, [e]);
  }
  const used = new Set<string>();
  const out: CsvFilePlan<T, E>[] = [];
  for (const t of trips) {
    const list = byTrip.get(t.id);
    if (!list || list.length === 0) continue;
    const base = csvFileNameForTrip(t, fallbackYear);
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = base.replace(/\.csv$/, `-${n}.csv`);
    used.add(name.toLowerCase());
    out.push({ trip: t, fileName: name, expenses: list });
  }
  return out;
}

/** "3 files saved to Downloads" / "1 file saved". */
export function savedMessage(n: number, where: string | null): string {
  return `${n} file${n === 1 ? '' : 's'} saved${where ? ` to ${where}` : ''}.`;
}
