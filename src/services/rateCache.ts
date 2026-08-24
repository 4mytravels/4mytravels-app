// Rate cache — fetches the latest ECB rates once at app start and persists
// them in the encrypted app_settings table. The expense form falls back to
// these cached rates when the live Frankfurter fetch fails (offline, weekend,
// API hiccup), and Settings shows what's cached so the user can see/verify.
import { getStorageAdapter } from '../db/index';

const CACHE_PREFIX = 'rate_cache:';
const DATE_KEY = 'rate_cache_date';
const BASE_KEY = 'rate_cache_base';

export interface RateCache {
  base: string;
  date: string; // ECB publication date of the cached rates
  rates: Record<string, number>; // quote -> rate per 1 base
  fetchedAt: string; // ISO timestamp of when we cached it
}

export async function loadRateCache(base?: string): Promise<RateCache | null> {
  try {
    const db = getStorageAdapter();
    // NOTE: 'rate_cache:%' would MISS the meta keys (rate_cache_date has an
    // underscore, not a colon) — match the whole prefix deliberately.
    const rows = await db.query<{ key: string; value: string }>(
      "SELECT key, value FROM app_settings WHERE key LIKE 'rate_cache%'",
    );
    if (rows.length === 0) return null;
    const rates: Record<string, number> = {};
    let date = '';
    let cachedBase = '';
    let fetchedAt = '';
    const FETCHED_KEY = 'rate_cache_fetched_at';
    for (const r of rows) {
      const n = parseFloat(r.value);
      if (r.key === DATE_KEY) { date = r.value; continue; }
      if (r.key === BASE_KEY) { cachedBase = r.value; continue; }
      if (r.key === FETCHED_KEY) { fetchedAt = r.value; continue; }
      if (!Number.isNaN(n)) rates[r.key.replace(CACHE_PREFIX, '')] = n;
    }
    if (Object.keys(rates).length === 0) return null;
    if (base && cachedBase && cachedBase !== base) return null; // wrong base → ignore
    return { base: cachedBase || base || 'EUR', date, rates, fetchedAt: fetchedAt || date };
  } catch {
    return null;
  }
}

/** Persist a full rates map for `base` (replaces the previous cache). */
export async function saveRateCache(base: string, date: string, rates: Record<string, number>): Promise<void> {
  const db = getStorageAdapter();
  // Clear old entries first (currency set may change between ECB publications).
  await db.exec("DELETE FROM app_settings WHERE key LIKE 'rate_cache%'");
  await db.exec('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [DATE_KEY, date]);
  await db.exec('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [BASE_KEY, base]);
  await db.exec(
    'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
    ['rate_cache_fetched_at', new Date().toISOString()],
  );
  for (const [quote, rate] of Object.entries(rates)) {
    await db.exec(
      'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
      [`${CACHE_PREFIX}${quote}`, String(rate)],
    );
  }
}
