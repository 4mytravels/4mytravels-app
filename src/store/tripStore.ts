// Zustand store for trips (MVP scope §3 — one store per concern).
// SQLite/SQLCipher is the source of truth; this store holds UI/derived state only.
import { create } from 'zustand';
import type { Trip, TripStatus } from '../types';

interface TripState {
  trips: Trip[];
  selectedTripId: string | null;
  setTrips: (trips: Trip[]) => void;
  addTrip: (trip: Trip) => void;
  updateTrip: (id: string, patch: Partial<Trip> & { coverBytes?: Uint8Array | null }) => void;
  removeTrip: (id: string) => void;
  selectTrip: (id: string | null) => void;
}

export const useTripStore = create<TripState>((set) => ({
  trips: [],
  selectedTripId: null,
  setTrips: (trips) => set({ trips }),
  addTrip: (trip) => set((s) => ({ trips: [...s.trips, trip] })),
  updateTrip: (id, patch) =>
    set((s) => ({ trips: s.trips.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
  removeTrip: (id) =>
    set((s) => ({
      trips: s.trips.filter((t) => t.id !== id),
      selectedTripId: s.selectedTripId === id ? null : s.selectedTripId,
    })),
  selectTrip: (id) => set({ selectedTripId: id }),
}));

/** Status derived from start/end date vs. today (§2.1). A started trip without an
 *  end date is `active`. Not a manually set field. */
export function deriveTripStatus(trip: Trip, today: Date = new Date()): TripStatus {
  const start = new Date(trip.startDate);
  if (isNaN(start.getTime())) return 'upcoming'; // invalid/empty start date
  const end = trip.endDate ? new Date(trip.endDate) : null;
  if (end && isNaN(end.getTime())) return 'active';
  if (today < start) return 'upcoming';
  if (end && today > end) return 'past';
  return 'active';
}
