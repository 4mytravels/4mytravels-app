// Trip repository — maps the Trip domain type to/from the encrypted DB via the
// active StorageAdapter (MVP scope §2.1, §3). Wires persistence into the store.
import { getStorageAdapter, type StorageAdapter } from './index';
import type { Trip } from '../types';

function parseCountries(raw: unknown): string[] | undefined {
  if (typeof raw !== 'string' || !raw) return undefined;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr.filter((c) => typeof c === 'string') as string[]) : undefined;
  } catch {
    return undefined;
  }
}

// op-sqlite v18 returns BLOB columns as ArrayBuffer; all UI code expects
// Uint8Array (.length indexing + btoa conversion). Normalize on read so
// cover photos survive an app reload.
function bytesFromBlob(raw: unknown): Uint8Array | null {
  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (ArrayBuffer.isView(raw)) {
    const view = raw as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  return null;
}

function rowToTrip(r: Record<string, unknown>): Trip & { coverBytes?: Uint8Array | null } {
  return {
    id: r.id as string,
    name: r.name as string,
    startDate: r.start_date as string,
    endDate: (r.end_date as string) || undefined,
    homeCurrency: r.home_currency as string,
    defaultCurrency: r.default_currency as string,
    dailyBudget: r.daily_budget as number,
    coverPhotoId: undefined, // blob stored separately; see §2.2 receipt/cover handling
    coverBytes: bytesFromBlob(r.cover_photo),
    countries: parseCountries(r.countries),
  };
}

export async function loadTrips(db: StorageAdapter = getStorageAdapter()): Promise<Trip[]> {
  const rows = await db.query<Record<string, unknown>>(
    'SELECT * FROM trips ORDER BY start_date DESC',
  );
  return rows.map(rowToTrip);
}

export async function saveTrip(trip: Trip, coverPhoto?: Uint8Array | null, db: StorageAdapter = getStorageAdapter()): Promise<void> {
  await db.exec(
    `INSERT OR REPLACE INTO trips
       (id, name, start_date, end_date, home_currency, default_currency, daily_budget, cover_photo, countries)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      trip.id,
      trip.name,
      trip.startDate,
      trip.endDate ?? null,
      trip.homeCurrency,
      trip.defaultCurrency,
      trip.dailyBudget,
      coverPhoto ?? (trip as Trip & { coverBytes?: Uint8Array | null }).coverBytes ?? null,
      trip.countries?.length ? JSON.stringify(trip.countries) : null,
    ],
  );
}

export async function updateTrip(trip: Trip, coverPhoto?: Uint8Array | null, db: StorageAdapter = getStorageAdapter()): Promise<void> {
  await db.exec(
    `UPDATE trips SET
       name = ?, start_date = ?, end_date = ?, home_currency = ?,
       default_currency = ?, daily_budget = ?, countries = ?,
       cover_photo = COALESCE(?, cover_photo)
     WHERE id = ?`,
    [
      trip.name,
      trip.startDate,
      trip.endDate ?? null,
      trip.homeCurrency,
      trip.defaultCurrency,
      trip.dailyBudget,
      trip.countries?.length ? JSON.stringify(trip.countries) : null,
      // undefined → keep existing photo; null explicitly clears it
      coverPhoto === undefined ? null : (coverPhoto ?? null),
      trip.id,
    ],
  );
}

export async function deleteTrip(id: string, db: StorageAdapter = getStorageAdapter()): Promise<void> {
  await db.exec('DELETE FROM trips WHERE id = ?', [id]);
  // GDPR erasure (§2.2): compact so deleted ciphertext does not linger on disk.
  await db.compact();
}
