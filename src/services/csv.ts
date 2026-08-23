// CSV export/import service.
//
// Export format (4MyTravels native):
//   id,trip_id,trip_name,date,amount,currency,rate_to_home,rate_date,
//   category,payment_method,country,notes,home_amount
// Import supports:
//   - our own CSV (detected by header)
//   - TravelSpend CSV exports (GPL-3.0 app; reading a user-exported data file
//     is fine — no TravelSpend code is used). Their column names are matched
//     by alias detection; unknown rows are skipped and reported.
import type { Expense, ExpenseCategory, PaymentMethod } from '../types';

export const EXPENSE_CSV_HEADER = [
  'id', 'trip_id', 'trip_name', 'date', 'amount', 'currency', 'rate_to_home',
  'rate_date', 'category', 'payment_method', 'country', 'notes', 'home_amount',
];

function esc(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function expensesToCsv(
  expenses: Expense[],
  tripNameById: Record<string, string> = {},
): string {
  const rows = expenses.map((e) =>
    [
      e.id, e.tripId, tripNameById[e.tripId] ?? '', e.rateDate, e.amount,
      e.currency, e.rateToHome, e.rateDate, e.category, e.paymentMethod,
      e.country ?? '', e.notes ?? '', toHome(e).toFixed(2),
    ].map(esc).join(','),
  );
  return [EXPENSE_CSV_HEADER.join(','), ...rows].join('\n');
}

// Minimal local conversion (mirrors utils/currency.toHomeCurrency without the
// store dependency so this module stays pure/service-level).
function toHome(e: Expense): number {
  return typeof e.rateToHome === 'number' ? e.amount * e.rateToHome : e.amount;
}

/** Tiny RFC-4180-ish CSV parser (handles quoted fields with commas/quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length > 0) { row.push(field); if (row.length > 1 || row[0] !== '') rows.push(row); }
  return rows;
}

export type ParsedExpense = Omit<Expense, 'id'> & { id?: string };

const CATEGORY_VALUES = [
  'Food', 'Transport', 'Accommodation', 'Groceries', 'Shopping', 'Activities',
  'Drinks', 'Coffee', 'Flights', 'General', 'Laundry', 'Gym', 'Work',
];

/**
 * Detects whether a parsed CSV is ours (header match on id+trip_id+amount).
 */
export function isOwnExpenseCsv(header: string[]): boolean {
  const h = header.map((x) => x.trim().toLowerCase());
  return h.includes('trip_id') && h.includes('amount') && h.includes('rate_to_home');
}

/** Parse our own CSV back into partial Expenses (ids preserved). */
export function parseOwnCsv(rows: string[][], tripIdFallback: string): ParsedExpense[] {
  const header = rows[0].map((x) => x.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name.toLowerCase());
  const out: ParsedExpense[] = [];
  for (let r = 1; r < rows.length; r++) {
    const c = rows[r];
    const get = (name: string) => c[idx(name)] ?? '';
    const category = get('category') as ExpenseCategory;
    out.push({
      id: get('id') || undefined,
      tripId: get('trip_id') || tripIdFallback,
      amount: parseFloat(get('amount')) || 0,
      currency: get('currency') || 'EUR',
      rateToHome: parseFloat(get('rate_to_home')) || 1,
      rateDate: get('rate_date') || get('date'),
      category: (CATEGORY_VALUES as string[]).includes(category) ? category : 'General',
      createdAt: get('date') ? `${get('date')}T12:00:00Z` : new Date().toISOString(),
      country: get('country') || undefined,
      paymentMethod: (get('payment_method') === 'card' ? 'card' : 'cash') as PaymentMethod,
      notes: get('notes') || undefined,
    });
  }
  return out;
}

/**
 * TravelSpend CSV support — best-effort alias matching against their export
 * columns (date/title/amount/currency/category/note/...). The exact header set
 * can change between app versions; rows missing an amount/date are skipped.
 */
const TS_ALIASES: Record<string, string[]> = {
  date: ['date', 'day', 'datum'],
  amount: ['amount', 'value', 'bedrag'],
  currency: ['currency', 'curr', 'valuta'],
  category: ['category', 'categoryname', 'categorie'],
  notes: ['note', 'notes', 'title', 'comment', 'notitie', 'titel'],
  country: ['country', 'land'],
};

function detectHeaderMap(header: string[]): Record<string, number> | null {
  const norm = header.map((h) => h.trim().toLowerCase().replace(/[^a-z]/g, ''));
  const map: Record<string, number> = {};
  for (const [key, aliases] of Object.entries(TS_ALIASES)) {
    const i = norm.findIndex((h) => aliases.includes(h));
    if (i >= 0) map[key] = i;
  }
  // minimum viable: date + amount + currency
  return map.date !== undefined && map.amount !== undefined && map.currency !== undefined ? map : null;
}

export function looksLikeTravelSpendCsv(header: string[]): boolean {
  return detectHeaderMap(header) !== null && !isOwnExpenseCsv(header);
}

export function parseTravelSpendCsv(rows: string[][], tripIdFallback: string): { items: ParsedExpense[]; skipped: number } {
  const map = detectHeaderMap(rows[0]);
  if (!map) return { items: [], skipped: 0 };
  const items: ParsedExpense[] = [];
  let skipped = 0;
  for (let r = 1; r < rows.length; r++) {
    const c = rows[r];
    const get = (k: string) => (map[k] !== undefined ? (c[map[k]] ?? '').trim() : '');
    const rawDate = get('date');
    const amount = parseFloat(get('amount').replace(',', '.'));
    if (!rawDate || Number.isNaN(amount)) { skipped++; continue; }
    const date = rawDate.slice(0, 10); // normalize YYYY-MM-DD...
    let iso: string;
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      iso = date;
    } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
      // dd/mm/yyyy → ISO (European convention used by TravelSpend exports)
      const [d, m, y] = date.split('/');
      iso = `${y}-${m}-${d}`;
    } else {
      const parsedDate = new Date(rawDate);
      iso = Number.isNaN(parsedDate.getTime()) ? '' : parsedDate.toISOString().slice(0, 10);
    }
    if (!iso) { skipped++; continue; }
    const categoryRaw = get('category');
    items.push({
      tripId: tripIdFallback,
      amount: Math.abs(amount),
      currency: (get('currency') || 'EUR').toUpperCase(),
      rateToHome: 1, // no rate info in TravelSpend CSV; user can fix via manual rates
      rateDate: iso,
      category: (CATEGORY_VALUES.find(
        (v) => v.toLowerCase() === categoryRaw.toLowerCase(),
      ) ?? 'General') as ExpenseCategory,
      createdAt: `${iso}T12:00:00Z`,
      country: get('country') || undefined,
      paymentMethod: 'card' as PaymentMethod,
      notes: get('notes') || undefined,
    });
  }
  return { items, skipped };
}
