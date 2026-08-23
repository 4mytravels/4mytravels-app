// Core domain types for the 4MyTravels MVP — Travel Spend Collector.
// Source of truth: MVP Scope Document v1.6 (§2.1).

export type PaymentMethod = 'cash' | 'card';

export type ExpenseCategory =
  | 'Food'
  | 'Transport'
  | 'Accommodation'
  | 'Groceries'
  | 'Shopping'
  | 'Activities'
  | 'Drinks'
  | 'Coffee'
  | 'Flights'
  | 'General'
  | 'Laundry'
  | 'Gym'
  | 'Work';

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Food',
  'Transport',
  'Accommodation',
  'Groceries',
  'Shopping',
  'Activities',
  'Drinks',
  'Coffee',
  'Flights',
  'General',
  'Laundry',
  'Gym',
  'Work',
];

// Either ISO date (YYYY-MM-DD), or ISO datetime with offset. Timezone-aware.
export type ISODateTime = string;

export interface MultiDaySplit {
  splitStart: string; // YYYY-MM-DD, must be >= trip.startDate
  splitEnd: string; // YYYY-MM-DD
}

export interface Expense {
  id: string;
  tripId: string;
  amount: number; // in the expense's own currency
  currency: string; // ISO 4217, e.g. "EUR"
  // Snapshot of the conversion to the trip's home currency, stored at entry time.
  rateToHome: number;
  rateDate: string; // YYYY-MM-DD
  category: ExpenseCategory;
  createdAt: ISODateTime; // timezone-aware
  country?: string;
  location?: string; // manual or GPS; never the raw EXIF geotag
  paymentMethod: PaymentMethod;
  notes?: string;
  receiptPhoto?: Uint8Array | null; // BLOB inside the encrypted DB (§2.2). EXIF GPS is never read/stored.
  multiDaySplit?: MultiDaySplit;
}

export type TripStatus = 'active' | 'upcoming' | 'past';

export interface Trip {
  id: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string; // optional — supports open-ended long-term travel
  homeCurrency: string; // ISO 4217
  defaultCurrency: string; // pre-selected in the expense entry form
  dailyBudget: number; // denominated in home currency
  coverPhotoId?: string; // blob inside encrypted DB, EXIF stripped
  countries?: string[]; // ISO 3166-1 alpha-2 codes visited on this trip, e.g. ['JP','TH']
}

export interface RateSnapshot {
  base: string; // ISO 4217
  date: string; // YYYY-MM-DD
  rates: Record<string, number>; // quote -> rate
  offline?: boolean;
}
