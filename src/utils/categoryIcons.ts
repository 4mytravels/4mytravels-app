// Category → Ionicons map for the WHOLE app.
//
// There used to be two maps that disagreed (the expense form's grid said
// Transport = bus / Groceries = cart / General = wallet, the Statistics donut
// said car / basket / grid), so the same category showed a different icon per
// screen. ONE map now, imported by the form (`CategoryChip`), the Statistics
// donut/legend and the filter sheets — never add a second copy.

import { Ionicons } from '@expo/vector-icons';
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
