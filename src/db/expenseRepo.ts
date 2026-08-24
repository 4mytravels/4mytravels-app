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

export async function loadExpenses(
  tripId?: string,
  db: StorageAdapter = getStorageAdapter(),
): Promise<Expense[]> {
  const sql = tripId
    ? 'SELECT * FROM expenses WHERE trip_id = ? ORDER BY created_at DESC'
    : 'SELECT * FROM expenses ORDER BY created_at DESC';
  const rows = await db.query<Record<string, unknown>>(sql, tripId ? [tripId] : []);
  return rows.map(rowToExpense);
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
  await db.exec('DELETE FROM expenses WHERE id = ?', [id]);
}
