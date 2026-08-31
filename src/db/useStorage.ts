// App-level storage bootstrap. Initializes the active StorageAdapter once and
// keeps the Zustand stores in sync with the encrypted DB (MVP scope §2, §3).
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { getStorageAdapter } from './index';
import { loadTrips, saveTrip, deleteTrip } from './tripRepo';
import { useTripStore } from '../store/tripStore';
import { getRates } from '../services/frankfurter';
import { saveRateCache } from '../services/rateCache';

// Refresh the ECB rate cache at app open (best-effort; silent on failure —
// the expense form falls back to the previously cached rates, or lets the user
// type a manual rate). Single API call: /v2/rates rows each carry their
// publication date, so we take the newest date from the response itself.
// Only writes when we actually got rates, so a failed fetch never wipes a
// previously good cache.
export async function refreshRateCache(base = 'EUR'): Promise<boolean> {
  // Small retry so a transient boot-time network blip doesn't leave the cache
  // empty (which would force the form onto the live fetch / manual entry).
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const rows = await getRates(base);
      if (rows.length === 0) {
        if (attempt < 2) continue;
        return false;
      }
      const date = [...rows].sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.date;
      if (!date) return false;
      const rates: Record<string, number> = { [base]: 1 };
      for (const r of rows) {
        if (r.base === base && typeof r.rate === 'number' && r.rate > 0) {
          rates[r.quote] = r.rate;
        }
      }
      if (Object.keys(rates).length <= 1) {
        if (attempt < 2) continue;
        return false;
      }
      await saveRateCache(base, date, rates);
      return true;
    } catch {
      if (attempt < 2) {
        await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
        continue;
      }
      return false;
    }
  }
  return false;
}

// Background refresh ~10s after app becomes usable (user request: keep the
// cached rates fresh in the background without ever blocking the UI). Takes the
// already-available `ready` flag from the single useStorageInit() instance in
// the root layout — do NOT call useStorageInit() again here, or the native
// adapter would be initialised twice and crash the app (reload loop).
export function useBackgroundRateRefresh(ready: boolean, delayMs = 10000) {
  useEffect(() => {
    if (!ready) return;
    let mounted = true;
    const t = setTimeout(() => {
      if (!mounted) return;
      void (async () => {
        try {
          const db = getStorageAdapter();
          const trips = await loadTrips(db);
          const base = trips[0]?.homeCurrency ?? 'EUR';
          await refreshRateCache(base);
        } catch {
          // silent — keep existing cache
        }
      })();
    }, delayMs);
    return () => {
      mounted = false;
      clearTimeout(t);
    };
  }, [ready, delayMs]);
}

export function useStorageInit() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setTrips = useTripStore((s) => s.setTrips);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const db = getStorageAdapter();
        await db.init({});
        const trips = await loadTrips(db);
        if (mounted) {
          setTrips(trips);
          setReady(true);
        }
        // Best-effort rate refresh after the app is usable (not blocking boot).
        void refreshRateCache(trips[0]?.homeCurrency ?? 'EUR');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (mounted) {
          setError(msg);
          // Surface the failure instead of hanging on the loader forever.
          Alert.alert('Storage error', msg);
          setReady(true); // allow UI to render; persistence will fail loud on write
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [setTrips]);

  return { ready, error };
}

// Wire store mutations to persistence. Call once near the root.
export function usePersistTrips() {
  const trips = useTripStore((s) => s.trips);
  const addTrip = useTripStore((s) => s.addTrip);
  const removeTrip = useTripStore((s) => s.removeTrip);

  // override addTrip/removeTrip to persist — kept simple: expose wrapped actions
  const addTripPersisted = (trip: Parameters<typeof addTrip>[0]) => {
    addTrip(trip);
    saveTrip(trip).catch((e) => console.error('saveTrip failed', e));
  };
  const removeTripPersisted = (id: string) => {
    removeTrip(id);
    deleteTrip(id).catch((e) => console.error('deleteTrip failed', e));
  };

  return { trips, addTripPersisted, removeTripPersisted };
}
