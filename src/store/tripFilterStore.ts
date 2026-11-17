// M10 — shared trip-filter selection for Statistics, Countries and Over time,
// so a selection made on one page is still active on the others. Empty = all
// trips (src/utils/tripFilter). Session-only on purpose: nothing persisted.
import { create } from 'zustand';

type TripFilterState = {
  selected: string[];
  toggle: (id: string) => void;
  clear: () => void;
  set: (ids: string[]) => void;
};

export const useTripFilterStore = create<TripFilterState>((set) => ({
  selected: [],
  toggle: (id) =>
    set((s) => ({ selected: s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id] })),
  clear: () => set({ selected: [] }),
  set: (ids) => set({ selected: [...ids] }),
}));
