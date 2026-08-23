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
 * TravelSpend CSV support — matched against REAL export headers (verified
 * against an actual 2023-era export):
 *   amount, amountInHomeCurrency, category, conversionRate, country,
 *   countryCode, datePaid (dd-mm-yyyy), homeCurrency, localCurrency, notes,
 *   paidBy, paymentMethod ("Credit Card"/"Cash"), place, type, ...
 * Numbers use comma decimals; rows without type=Expense are skipped.
 */
const TS_ALIASES: Record<string, string[]> = {
  date: ['datepaid', 'date', 'day', 'datum'],
  amount: ['amount', 'value', 'bedrag'],
  homeAmount: ['amountinhomecurrency'],
  rate: ['conversionrate'],
  currency: ['localcurrency', 'currency', 'curr', 'valuta'],
  homeCurrency: ['homecurrency'],
  category: ['category', 'categoryname', 'categorie'],
  notes: ['notes', 'note', 'title', 'comment', 'notitie', 'titel'],
  country: ['country', 'land'],
  countryCode: ['countrycode'],
  paymentMethod: ['paymentmethod'],
  type: ['type'],
};

function detectHeaderMap(header: string[]): Record<string, number> | null {
  const norm = header.map((h) => h.trim().toLowerCase().replace(/[^a-z]/g, ''));
  const map: Record<string, number> = {};
  for (const [key, aliases] of Object.entries(TS_ALIASES)) {
    const i = norm.findIndex((h) => aliases.includes(h));
    if (i >= 0) map[key] = i;
  }
  // minimum viable: datePaid + amount + a currency column
  return map.date !== undefined && map.amount !== undefined && map.currency !== undefined ? map : null;
}

export function looksLikeTravelSpendCsv(header: string[]): boolean {
  return detectHeaderMap(header) !== null && !isOwnExpenseCsv(header);
}

/** TravelSpend categories → our ExpenseCategory (unmatched → General). */
function mapTsCategory(raw: string): ExpenseCategory {
  const r = raw.trim().toLowerCase();
  const direct = CATEGORY_VALUES.find((v) => v.toLowerCase() === r) as ExpenseCategory | undefined;
  if (direct) return direct;
  const aliasMap: Record<string, ExpenseCategory> = {
    transportation: 'Transport',
    transport: 'Transport',
    'food & drinks': 'Food',
    foods: 'Food',
    groceries: 'Groceries',
    accommodation: 'Accommodation',
    lodging: 'Accommodation',
    shopping: 'Shopping',
    activities: 'Activities',
    'activities & entertainment': 'Activities',
    entertainment: 'Activities',
    drinks: 'Drinks',
    alcohol: 'Drinks',
    coffee: 'Coffee',
    flights: 'Flights',
    'flights & transport': 'Flights',
    laundry: 'Laundry',
    gym: 'Gym',
    work: 'Work',
    fees: 'General',
    other: 'General',
    uncategorized: 'General',
  } as Record<string, ExpenseCategory>;
  return (aliasMap[r] ?? 'General') as ExpenseCategory;
}

function mapTsPayment(raw: string): PaymentMethod {
  return /credit|card|pin|debit/i.test(raw) ? 'card' : 'cash';
}

/** Parse a number like "12,10" or "1250.75" → 12.10 / 1250.75. */
function parseTsNumber(raw: string): number {
  const s = raw.trim().replace(/^"|"$/g, '');
  // If both separators exist, the LAST one is the decimal separator.
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let normalized = s;
  if (lastComma > lastDot) {
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (lastComma > -1 && (lastDot === -1 || lastComma > lastDot)) {
    normalized = s.replace(/,/g, '.');
  }
  const n = parseFloat(normalized.replace(/[^0-9.-]/g, ''));
  return Number.isNaN(n) ? NaN : n;
}

export function parseTravelSpendCsv(rows: string[][], tripIdFallback: string): { items: ParsedExpense[]; skipped: number } {
  const map = detectHeaderMap(rows[0]);
  if (!map) return { items: [], skipped: 0 };
  const getCell = (r: string[], key: string) => {
    const i = map[key];
    let v = i !== undefined ? (r[i] ?? '').trim() : '';
    // Our CSV writer already unquotes; strip stray surrounding quotes just in case.
    v = v.replace(/^"|"$/g, '');
    return v;
  };
  const items: ParsedExpense[] = [];
  let skipped = 0;
  for (let r = 1; r < rows.length; r++) {
    const c = rows[r];
    if (c.length <= 1) continue;
    const rawDate = getCell(c, 'date');           // dd-mm-yyyy in real exports
    const amount = parseTsNumber(getCell(c, 'amount'));
    if (!rawDate || Number.isNaN(amount)) { skipped++; continue; }
    const type = getCell(c, 'type');
    if (type && type.toLowerCase() !== 'expense') { skipped++; continue; }

    let iso = '';
    const dmy = rawDate.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate.slice(0, 10))) {
      iso = rawDate.slice(0, 10);
    } else if (dmy) {
      iso = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    } else {
      const parsedDate = new Date(rawDate);
      iso = Number.isNaN(parsedDate.getTime()) ? '' : parsedDate.toISOString().slice(0, 10);
    }
    if (!iso) { skipped++; continue; }

    const rateRaw = getCell(c, 'rate');
    const rate = rateRaw ? parseTsNumber(rateRaw) : NaN;
    const homeRaw = getCell(c, 'homeAmount');
    const homeAmount = homeRaw ? parseTsNumber(homeRaw) : NaN;
    const currency = (getCell(c, 'currency') || 'EUR').toUpperCase();

    items.push({
      tripId: tripIdFallback,
      amount: Math.abs(amount),
      currency,
      // Prefer the export's own conversionRate; fall back to amount/homeAmount.
      rateToHome: !Number.isNaN(rate) && rate > 0
        ? rate
        : !Number.isNaN(homeAmount) && amount > 0
          ? homeAmount / Math.abs(amount)
          : 1,
      rateDate: iso,
      category: mapTsCategory(getCell(c, 'category')),
      createdAt: `${iso}T12:00:00Z`,
      country: getCell(c, 'countryCode') || getCell(c, 'country') || undefined,
      paymentMethod: mapTsPayment(getCell(c, 'paymentMethod')),
      notes: getCell(c, 'notes') || undefined,
    });
  }
  return { items, skipped };
}
