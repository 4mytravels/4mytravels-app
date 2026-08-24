// App-level storage bootstrap. Initializes the active StorageAdapter once and
// keeps the Zustand stores in sync with the encrypted DB (MVP scope §2, §3).
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { getStorageAdapter } from './index';
import { loadTrips, saveTrip, deleteTrip } from './tripRepo';
import { useTripStore } from '../store/tripStore';
import { getRatesMap } from '../services/frankfurter';
import { saveRateCache } from '../services/rateCache';

// Refresh the ECB rate cache at app open (best-effort; silent on failure —
// the expense form falls back to the previously cached rates).
export async function refreshRateCache(base = 'EUR'): Promise<boolean> {
  try {
    const rates = await getRatesMap(base);
    const date = Object.keys(rates).length > 0 ? (await getRateDate(base)) ?? new Date().toISOString().slice(0, 10) : '';
    if (!date) return false;
    await saveRateCache(base, date, rates);
    return true;
  } catch {
    return false;
  }
}

// The /v2/rates rows carry the publication date; grab the newest one.
async function getRateDate(base: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.frankfurter.dev/v2/rates?base=${encodeURIComponent(base)}`);
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ date: string }>;
    return rows.length ? [...rows].sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.date ?? null : null;
  } catch {
    return null;
  }
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
