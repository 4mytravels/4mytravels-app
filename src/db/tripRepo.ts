// Trip repository — maps the Trip domain type to/from the encrypted DB via the
// active StorageAdapter (MVP scope §2.1, §3). Wires persistence into the store.
import { getStorageAdapter, type StorageAdapter } from './index';
import { bytesFromBlob } from './blob';
import type { Trip } from '../types';
import { normalizeTripIcon } from '../utils/tripIcons';

function parseCountries(raw: unknown): string[] | undefined {
  if (typeof raw !== 'string' || !raw) return undefined;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr.filter((c) => typeof c === 'string') as string[]) : undefined;
  } catch {
    return undefined;
  }
}

// op-sqlite BLOB normalization now lives in ./blob (shared with expenseRepo).

/** In-memory trip: `coverThumb` for cards (M4), `coverBytes` only on the
 *  explicit full-cover paths (editor, backup). */
export type TripRow = Trip & { coverBytes?: Uint8Array | null; coverThumb?: Uint8Array | null };

function rowToTrip(r: Record<string, unknown>): TripRow {
  return {
    id: r.id as string,
    name: r.name as string,
    startDate: r.start_date as string,
    endDate: (r.end_date as string) || undefined,
    homeCurrency: r.home_currency as string,
    defaultCurrency: r.default_currency as string,
    dailyBudget: r.daily_budget as number,
    coverPhotoId: undefined, // blob stored separately; see §2.2 receipt/cover handling
    // Only present when the query selected it (loadTripsWithCovers).
    coverBytes: 'cover_photo' in r ? bytesFromBlob(r.cover_photo) : undefined,
    coverThumb: bytesFromBlob(r.cover_thumb),
    countries: parseCountries(r.countries),
    icon: normalizeTripIcon(r.icon),
  };
}

// M4: every column EXCEPT the full cover BLOB. `SELECT *` always materialises
// cover_photo (~500 KB per trip) — the cold start paid for every cover just to
// draw ~40 KB thumbnails. Same trap as receipt_photo (pattern 43).
const LIST_COLUMNS =
  'id, name, start_date, end_date, home_currency, default_currency, daily_budget, countries, cover_thumb, icon';

/** Trips for the UI: metadata + card thumbnail, no full cover. */
export async function loadTrips(db: StorageAdapter = getStorageAdapter()): Promise<TripRow[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT ${LIST_COLUMNS} FROM trips ORDER BY start_date DESC`,
  );
  return rows.map(rowToTrip);
}

/** Trips WITH the full cover — backups only (a backup must never lose photos). */
export async function loadTripsWithCovers(db: StorageAdapter = getStorageAdapter()): Promise<TripRow[]> {
  const rows = await db.query<Record<string, unknown>>('SELECT * FROM trips ORDER BY start_date DESC');
  return rows.map(rowToTrip);
}

/** The full cover of ONE trip (editor preview / keep-on-save). */
export async function loadTripCover(
  id: string,
  db: StorageAdapter = getStorageAdapter(),
): Promise<Uint8Array | null> {
  const rows = await db.query<Record<string, unknown>>(
    'SELECT cover_photo FROM trips WHERE id = ? LIMIT 1',
    [id],
  );
  return rows.length ? bytesFromBlob(rows[0].cover_photo) : null;
}

/**
 * Covers stored before cover_thumb existed (or written by a restore) get a
 * thumbnail once. `makeThumb` is injected (image manipulator at runtime) so
 * this module stays testable without native code. Returns the id → thumb map
 * that was written, so the caller can update the store.
 */
export async function backfillCoverThumbs(
  makeThumb: (cover: Uint8Array) => Promise<Uint8Array | null>,
  db: StorageAdapter = getStorageAdapter(),
): Promise<Record<string, Uint8Array>> {
  const ids = await db.query<Record<string, unknown>>(
    'SELECT id FROM trips WHERE cover_photo IS NOT NULL AND cover_thumb IS NULL',
  );
  const done: Record<string, Uint8Array> = {};
  for (const r of ids) {
    const id = r.id as string;
    const cover = await loadTripCover(id, db);
    if (!cover || cover.length === 0) continue;
    const thumb = await makeThumb(cover);
    if (!thumb) continue;
    await db.exec('UPDATE trips SET cover_thumb = ? WHERE id = ?', [thumb, id]);
    done[id] = thumb;
  }
  return done;
}

export async function saveTrip(
  trip: Trip,
  coverPhoto?: Uint8Array | null,
  db: StorageAdapter = getStorageAdapter(),
  coverThumb?: Uint8Array | null,
): Promise<void> {
  const cover = coverPhoto ?? (trip as TripRow).coverBytes ?? null;
  // Without a cover there is no thumbnail; with one but no thumb yet, NULL —
  // backfillCoverThumbs() fills it on the next start.
  const thumb = cover ? (coverThumb ?? (trip as TripRow).coverThumb ?? null) : null;
  await db.exec(
    `INSERT OR REPLACE INTO trips
       (id, name, start_date, end_date, home_currency, default_currency, daily_budget, cover_photo, countries, cover_thumb, icon)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      trip.id,
      trip.name,
      trip.startDate,
      trip.endDate ?? null,
      trip.homeCurrency,
      trip.defaultCurrency,
      trip.dailyBudget,
      cover,
      trip.countries?.length ? JSON.stringify(trip.countries) : null,
      thumb,
      normalizeTripIcon(trip.icon),
    ],
  );
}

export async function updateTrip(
  trip: Trip,
  coverPhoto?: Uint8Array | null,
  db: StorageAdapter = getStorageAdapter(),
  coverThumb?: Uint8Array | null,
): Promise<void> {
  // cover_photo is written verbatim — NO COALESCE. COALESCE(?, cover_photo)
  // made "Remove photo" a silent no-op: clearing the photo binds NULL, and
  // SQLite keeps the old blob. So the caller can no longer express "clear" —
  // and a *changed* photo only worked when the caller had also reset its
  // `removed` flag, which the edit screen did not, so a changed photo ended up
  // neither stored nor cleared.
  //   undefined → keep the existing blob (assign the column to itself)
  //   null      → explicitly clear it
  //   bytes     → replace it
  // M4: cover_thumb follows the cover in lockstep (keep / clear / replace);
  // a replaced cover without a thumb gets NULL and is backfilled later.
  const coverSql =
    coverPhoto === undefined ? 'cover_photo = cover_photo' : 'cover_photo = ?, cover_thumb = ?';
  const params: unknown[] = [
    trip.name,
    trip.startDate,
    trip.endDate ?? null,
    trip.homeCurrency,
    trip.defaultCurrency,
    trip.dailyBudget,
    trip.countries?.length ? JSON.stringify(trip.countries) : null,
    normalizeTripIcon(trip.icon),
  ];
  if (coverPhoto !== undefined) params.push(coverPhoto, coverPhoto ? (coverThumb ?? null) : null);
  params.push(trip.id);

  await db.exec(
    `UPDATE trips SET
       name = ?, start_date = ?, end_date = ?, home_currency = ?,
       default_currency = ?, daily_budget = ?, countries = ?, icon = ?,
       ${coverSql}
     WHERE id = ?`,
    params,
  );
}

export async function deleteTrip(id: string, db: StorageAdapter = getStorageAdapter()): Promise<void> {
  // Delete children explicitly — SQLite only enforces ON DELETE CASCADE when
  // PRAGMA foreign_keys=ON, which op-sqlite does not enable by default. Without
  // this the expenses would linger as orphans (GDPR erasure §2.2).
  await db.exec('DELETE FROM expenses WHERE trip_id = ?', [id]);
  await db.exec('DELETE FROM trips WHERE id = ?', [id]);
  // GDPR erasure (§2.2): compact so deleted ciphertext does not linger on disk.
  await db.compact();
}
