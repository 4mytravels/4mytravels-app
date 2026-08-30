// Global app settings (Zustand + persisted to the encrypted DB via a simple
// key-value table). Currently: manual FX rate overrides per currency pair,
// set once in Settings — applied to every expense entry app-wide (§2.5).
//
// Rates are stored as strings in the `app_settings` table:
//   key = 'manual_rate:<FROM>_<TO>'  value = decimal string
import { create } from 'zustand';
import { getStorageAdapter } from '../db/index';

interface SettingsState {
  /** Map like { "USD_EUR": 0.92 } — FROM_TO, rate = TO per 1 FROM. */
  manualRates: Record<string, number>;
  /** Global default home currency, applied to new trips (overridable per trip). */
  defaultHomeCurrency: string;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setManualRate: (from: string, to: string, rate: number | null) => Promise<void>;
  setDefaultHomeCurrency: (c: string) => Promise<void>;
}

const keyFor = (from: string, to: string) => `manual_rate:${from}_${to}`;

export const useSettingsStore = create<SettingsState>((set, get) => ({
  manualRates: {},
  defaultHomeCurrency: 'EUR',
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const db = getStorageAdapter();
      const rows = await db.query<{ key: string; value: string }>(
        "SELECT key, value FROM app_settings WHERE key LIKE 'manual_rate:%'",
      );
      const rates: Record<string, number> = {};
      for (const r of rows) {
        const n = parseFloat(r.value);
        if (!Number.isNaN(n) && n > 0) rates[r.key.replace('manual_rate:', '')] = n;
      }
      // Global default home currency (Settings → Preferences), falls back to EUR.
      const defRows = await db.query<{ key: string; value: string }>(
        "SELECT value FROM app_settings WHERE key = 'default_home_currency'",
      );
      const defaultHomeCurrency = defRows[0]?.value || 'EUR';
      set({ manualRates: rates, defaultHomeCurrency, hydrated: true });
    } catch {
      // Table may not exist yet (older DB) — treat as no overrides.
      set({ hydrated: true });
    }
  },
  setManualRate: async (from, to, rate) => {
    const db = getStorageAdapter();
    const k = keyFor(from, to);
    if (rate == null) {
      await db.exec('DELETE FROM app_settings WHERE key = ?', [k]);
      const next = { ...get().manualRates };
      delete next[`${from}_${to}`];
      set({ manualRates: next });
    } else {
      await db.exec(
        'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
        [k, String(rate)],
      );
      set({ manualRates: { ...get().manualRates, [`${from}_${to}`]: rate } });
    }
  },
  setDefaultHomeCurrency: async (c: string) => {
    const db = getStorageAdapter();
    await db.exec(
      'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
      ['default_home_currency', c],
    );
    set({ defaultHomeCurrency: c });
  },
}));

/** Look up a manual override for currency -> home. Returns null when unset. */
export function getManualRate(rates: Record<string, number>, from: string, to: string): number | null {
  if (from === to) return 1;
  return rates[`${from}_${to}`] ?? null;
}
