// Trip → icon, ONE helper for the whole app (like categoryIcon()).
// `trips.icon` is nullable: older rows, CSV-imported trips, restored backups
// from before the column existed and any unknown name fall back to the
// default, so a trip never renders a blank icon.
//
// Names are Ionicons glyphs, or MaterialCommunityIcons glyphs with an `mci:`
// prefix (Ionicons has no palm tree / mountains / safari / diving etc.).
// Render through <AppIcon>, which resolves the prefix.

import type Ionicons from '@expo/vector-icons/Ionicons';

export type IoniconName = keyof typeof Ionicons.glyphMap;
export type TripIconName = IoniconName | `mci:${string}`;

export const DEFAULT_TRIP_ICON: TripIconName = 'airplane-outline';

/** Curated set shown in the trip editor, grouped: transport, trip type, purpose. */
export const TRIP_ICONS: readonly TripIconName[] = [
  // transport
  'airplane-outline',
  'car-outline',
  'train-outline',
  'bus-outline',
  'boat-outline',
  'mci:sail-boat',
  'mci:caravan',
  'mci:motorbike',
  'bicycle-outline',
  'walk-outline',
  // kind of trip
  'mci:palm-tree',
  'mci:beach',
  'mci:island',
  'mci:image-filter-hdr', // mountains
  'mci:hiking',
  'mci:ski',
  'snow-outline',
  'mci:tent',
  'mci:pine-tree',
  'mci:elephant', // safari / wildlife
  'mci:diving-scuba',
  'mci:surfing',
  'mci:city',
  'mci:castle', // culture / sightseeing
  'sunny-outline',
  // purpose / mood
  'mci:bag-suitcase',
  'briefcase-outline',
  'school-outline',
  'heart-outline',
  'mci:party-popper',
  'mci:glass-cocktail',
  'restaurant-outline',
  'camera-outline',
  'home-outline',
  'globe-outline',
];

/** Names from the first icon set (v1.1.3 dev) that left the grid but may be
 *  stored already: still valid, so those trips keep their icon. */
const LEGACY: readonly TripIconName[] = [
  'car-sport-outline', 'umbrella-outline', 'leaf-outline', 'trail-sign-outline',
  'bonfire-outline', 'star-outline', 'map-outline', 'compass-outline',
];

const KNOWN = new Set<string>([...TRIP_ICONS, ...LEGACY]);

/** Normalise a stored value: only curated/legacy names survive, else null (= default). */
export function normalizeTripIcon(raw: unknown): TripIconName | null {
  return typeof raw === 'string' && KNOWN.has(raw) ? (raw as TripIconName) : null;
}

/** Icon for ANY trip-like value; never read `trip.icon` directly in UI. */
export function tripIcon(trip: { icon?: string | null } | null | undefined): TripIconName {
  return normalizeTripIcon(trip?.icon) ?? DEFAULT_TRIP_ICON;
}

/** Split a name into its font family + glyph. */
export function splitIconName(name: string): { family: 'ion' | 'mci'; glyph: string } {
  return name.startsWith('mci:') ? { family: 'mci', glyph: name.slice(4) } : { family: 'ion', glyph: name };
}

/** Human label for accessibility ("palm tree", "image filter hdr" → "mountains"). */
export function tripIconLabel(name: string): string {
  const { glyph } = splitIconName(name);
  if (glyph === 'image-filter-hdr') return 'mountains';
  if (glyph === 'elephant') return 'safari';
  return glyph.replace(/-outline$/, '').replace(/-/g, ' ');
}
