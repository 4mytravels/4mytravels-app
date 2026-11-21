// Trip → Ionicons icon, ONE helper for the whole app (like categoryIcon()).
// `trips.icon` is nullable: older rows, CSV-imported trips, restored backups
// from before the column existed and any unknown name fall back to the
// default, so a trip never renders a blank icon.

import type Ionicons from '@expo/vector-icons/Ionicons';

export type TripIconName = keyof typeof Ionicons.glyphMap;

export const DEFAULT_TRIP_ICON: TripIconName = 'airplane-outline';

/** Curated travel set shown in the trip editor (all exist in Ionicons). */
export const TRIP_ICONS: readonly TripIconName[] = [
  'airplane-outline',
  'boat-outline',
  'car-outline',
  'car-sport-outline',
  'train-outline',
  'bus-outline',
  'bicycle-outline',
  'walk-outline',
  'umbrella-outline',
  'sunny-outline',
  'snow-outline',
  'leaf-outline',
  'trail-sign-outline',
  'bonfire-outline',
  'briefcase-outline',
  'restaurant-outline',
  'camera-outline',
  'heart-outline',
  'star-outline',
  'globe-outline',
  'map-outline',
  'compass-outline',
  'home-outline',
  'school-outline',
];

const KNOWN = new Set<string>(TRIP_ICONS);

/** Normalise a stored value: only curated names survive, else null (= default). */
export function normalizeTripIcon(raw: unknown): TripIconName | null {
  return typeof raw === 'string' && KNOWN.has(raw) ? (raw as TripIconName) : null;
}

/** Icon for ANY trip-like value; never read `trip.icon` directly in UI. */
export function tripIcon(trip: { icon?: string | null } | null | undefined): TripIconName {
  return normalizeTripIcon(trip?.icon) ?? DEFAULT_TRIP_ICON;
}
