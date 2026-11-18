// Category → Ionicons map for the WHOLE app.
//
// There used to be two maps that disagreed (the expense form's grid said
// Transport = bus / Groceries = cart / General = wallet, the Statistics donut
// said car / basket / grid), so the same category showed a different icon per
// screen. ONE map now, imported by the form (`CategoryChip`), the Statistics
// donut/legend and the filter sheets — never add a second copy.

import Ionicons from '@expo/vector-icons/Ionicons';
import type { ExpenseCategory } from '../types';

export type CategoryIconName = keyof typeof Ionicons.glyphMap;

export const categoryIcons: Record<ExpenseCategory, CategoryIconName> = {
  Food: 'restaurant-outline',
  Transport: 'bus-outline',
  Accommodation: 'bed-outline',
  Groceries: 'cart-outline',
  Shopping: 'bag-outline',
  Activities: 'compass-outline',
  Drinks: 'wine-outline',
  Coffee: 'cafe-outline',
  Flights: 'airplane-outline',
  General: 'wallet-outline',
  Laundry: 'shirt-outline',
  Gym: 'barbell-outline',
  Work: 'briefcase-outline',
};

/**
 * Icon for ANY category string. Imported CSVs and older rows can carry
 * categories outside `ExpenseCategory` (and the donut's synthetic "Others"
 * slice), so an unknown name must not render blank.
 */
export function categoryIcon(category: string): CategoryIconName {
  return categoryIcons[category as ExpenseCategory] ?? 'ellipsis-horizontal-outline';
}

/**
 * Category → filled circle colour, ONE map for the whole app (row icon circle,
 * expense-form tile, Statistics donut + legend). White icon on top, so every
 * colour is a saturated mid-tone that reads on BOTH the dark and light theme
 * (theme-independent on purpose: the circle is its own surface).
 */
export const categoryColors: Record<ExpenseCategory, string> = {
  Food: '#F97316', // orange
  Transport: '#3B82F6', // blue
  Accommodation: '#8B5CF6', // purple
  Groceries: '#16A34A', // green
  Shopping: '#EC4899', // pink
  Activities: '#0F766E', // teal
  Drinks: '#E11D48', // rose
  Coffee: '#92400E', // brown
  Flights: '#0284C7', // sky
  General: '#64748B', // slate
  Laundry: '#0891B2', // cyan
  Gym: '#B45309', // amber
  Work: '#4F46E5', // indigo
};

/** Neutral fallback for unknown / imported categories and the "Others" slice. */
export const CATEGORY_COLOR_FALLBACK = '#6B7280';

/** Never index `categoryColors` directly — imported categories fall back here. */
export function categoryColor(category: string): string {
  return categoryColors[category as ExpenseCategory] ?? CATEGORY_COLOR_FALLBACK;
}
