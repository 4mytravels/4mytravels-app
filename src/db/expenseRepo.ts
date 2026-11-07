// Expense repository — maps the Expense domain type to/from the encrypted DB via
// the active StorageAdapter (MVP scope §2.1, §2.2). Receipt photo is a BLOB
// column so all local data stays encrypted (§2.2).
import { getStorageAdapter, type StorageAdapter } from './index';
import { bytesFromBlob } from './blob';
import type { Expense } from '../types';

function rowToExpense(r: Record<string, unknown>): Expense {
  return {
    id: r.id as string,
    tripId: r.trip_id as string,
    amount: r.amount as number,
    currency: r.currency as string,
    rateToHome: r.rate_to_home as number,
    rateDate: r.rate_date as string,
    category: r.category as Expense['category'],
    createdAt: r.created_at as string,
    country: (r.country as string) || undefined,
    location: (r.location as string) || undefined,
    paymentMethod: r.payment_method as Expense['paymentMethod'],
    notes: (r.notes as string) || undefined,
    receiptPhoto: bytesFromBlob(r.receipt_photo),
    multiDaySplit:
      r.multi_day_split_start && r.multi_day_split_end
        ? { splitStart: r.multi_day_split_start as string, splitEnd: r.multi_day_split_end as string }
        : undefined,
  };
}

// Every column EXCEPT receipt_photo. Listing them explicitly is what makes the
// receipt skip possible: `SELECT *` always materializes the BLOB.
//
// WHY THIS EXISTS (measured, 2026-10-23): a receipt photo is a resized (~2000px)
// JPEG, so a few hundred KB per row. On a 2000-expense table (2 of 3 with a
// photo = 456 MB of BLOBs) `SELECT *` took 814 ms and pushed every byte across
// the storage/JS boundary, while the same rows WITHOUT the blob column took
// 4.1 ms — ~200x faster, and that is before SQLCipher decryption. Home, the
// Expenses list and Statistics only need the metadata: ExpenseRow renders no
// photo at all. Only the edit form needs the bytes (to keep or replace them),
// and it fetches them per-expense with loadExpense().
const METADATA_COLUMNS = [
  'id',
  'trip_id',
  'amount',
  'currency',
  'rate_to_home',
  'rate_date',
  'category',
  'created_at',
  'country',
  'location',
  'payment_method',
  'notes',
  'multi_day_split_start',
  'multi_day_split_end',
].join(', ');

export async function loadExpenses(
  tripId?: string,
  db: StorageAdapter = getStorageAdapter(),
  opts: { withReceipts?: boolean } = {},
): Promise<Expense[]> {
  // Default TRUE: a backup/export must never silently lose the photos. Screens
  // that only render a list pass `withReceipts: false`.
  const withReceipts = opts.withReceipts !== false;
  const columns = withReceipts ? '*' : METADATA_COLUMNS;
  const sql = tripId
    ? `SELECT ${columns} FROM expenses WHERE trip_id = ? ORDER BY created_at DESC`
    : `SELECT ${columns} FROM expenses ORDER BY created_at DESC`;
  const rows = await db.query<Record<string, unknown>>(sql, tripId ? [tripId] : []);
  return rows.map(rowToExpense);
}

/**
 * Metadata-only variant for LIST screens (home, Expenses, Statistics, trip
 * cards). Identical rows, but without the receipt BLOBs — see METADATA_COLUMNS.
 * Never use this to feed the edit form: load the full row with loadExpense()
 * first, or the next save clears the photo.
 */
export async function loadExpensesForList(
  tripId?: string,
  db: StorageAdapter = getStorageAdapter(),
): Promise<Expense[]> {
  return loadExpenses(tripId, db, { withReceipts: false });
}

/**
 * ONE expense WITH its receipt bytes.
 *
 * Required before opening the edit form: the list loads expenses without the
 * receipt BLOB (see METADATA_COLUMNS), and `saveExpense` writes
 * `receiptPhoto: receiptBytes` verbatim. Handing the form a receipt-less expense
 * would therefore CLEAR the photo on the next save — the same class of bug as
 * the COALESCE/three-state trap in updateTrip. Always load the full row before
 * editing.
 */
export async function loadExpense(
  id: string,
  db: StorageAdapter = getStorageAdapter(),
): Promise<Expense | null> {
  const rows = await db.query<Record<string, unknown>>(
    'SELECT * FROM expenses WHERE id = ? LIMIT 1',
    [id],
  );
  return rows.length ? rowToExpense(rows[0]) : null;
}

export async function saveExpense(
  expense: Expense,
  db: StorageAdapter = getStorageAdapter(),
): Promise<void> {
  await db.exec(
    `INSERT OR REPLACE INTO expenses
       (id, trip_id, amount, currency, rate_to_home, rate_date, category, created_at,
        country, location, payment_method, notes, receipt_photo,
        multi_day_split_start, multi_day_split_end)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      expense.id,
      expense.tripId,
      expense.amount,
      expense.currency,
      expense.rateToHome,
      expense.rateDate,
      expense.category,
      expense.createdAt,
      expense.country ?? null,
      expense.location ?? null,
      expense.paymentMethod,
      expense.notes ?? null,
      expense.receiptPhoto ?? null,
      expense.multiDaySplit?.splitStart ?? null,
      expense.multiDaySplit?.splitEnd ?? null,
    ],
  );
}

export async function deleteExpense(
  id: string,
  db: StorageAdapter = getStorageAdapter(),
): Promise<void> {
  const t0 = Date.now();
  try {
    await db.exec('DELETE FROM expenses WHERE id = ?', [id]);
    console.log(`[deleteExpense] SQL DELETE took ${Date.now() - t0}ms for id=${id}`);
  } catch (e) {
    console.error(`[deleteExpense] FAILED after ${Date.now() - t0}ms:`, e);
    throw e;
  }
}
