// Schema + migrations for the encrypted local database (MVP scope §2.1–§2.2).
// Runs against whatever StorageAdapter is active. Receipt/cover photos are stored
// as BLOB columns so "all local data is encrypted" holds literally (§2.2).

export const SCHEMA_VERSION = 2;

// SQL executed in order at init. Idempotent via IF NOT EXISTS.
// v1 = baseline tables (+ app_settings). v2 = trips.countries (JSON array of
// ISO 3166-1 alpha-2 codes, e.g. '["JP","TH"]').
export const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT,
    home_currency TEXT NOT NULL,
    default_currency TEXT NOT NULL,
    daily_budget REAL NOT NULL,
    cover_photo BLOB
  )`,

  `CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    rate_to_home REAL NOT NULL,
    rate_date TEXT NOT NULL,
    category TEXT NOT NULL,
    created_at TEXT NOT NULL,
    country TEXT,
    location TEXT,
    payment_method TEXT NOT NULL,
    notes TEXT,
    receipt_photo BLOB,
    multi_day_split_start TEXT,
    multi_day_split_end TEXT,
    FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
  )`,

  `CREATE INDEX IF NOT EXISTS idx_expenses_trip ON expenses(trip_id)`,
  `CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category)`,

  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
];

// v2: trips.countries — JSON string array of ISO 3166-1 alpha-2 codes.
// SQLite has no ADD COLUMN IF NOT EXISTS, so this runs guarded (see
// ensureCountriesColumn) on every init instead of via MIGRATIONS.
export const COUNTRIES_COLUMN_SQL = `ALTER TABLE trips ADD COLUMN countries TEXT`;

export const SCHEMA_TABLE = `CREATE TABLE IF NOT EXISTS _schema (
  key TEXT PRIMARY KEY,
  value TEXT
)`;

export async function runMigrations(
  exec: (sql: string, params?: unknown[]) => Promise<void>,
  getVersion: () => Promise<number>,
  setVersion: (v: number) => Promise<void>,
): Promise<void> {
  // ensure the schema-version table exists
  await exec(SCHEMA_TABLE);
  const current = await getVersion();
  // In MVP only version 1 exists; future versions run incremental migrations here.
  if (current < SCHEMA_VERSION) {
    for (const sql of MIGRATIONS) {
      await exec(sql);
    }
    await setVersion(SCHEMA_VERSION);
  }
  // Safety net: ensure every table in MIGRATIONS exists even when the stored
  // schema version is already current (e.g. app_settings added to an existing
  // v1 database). All statements are idempotent (IF NOT EXISTS).
  for (const sql of MIGRATIONS) {
    await exec(sql);
  }
  // v2: ensure trips.countries exists (guarded — no IF NOT EXISTS for columns).
  try {
    await exec("SELECT countries FROM trips LIMIT 1");
  } catch {
    await exec(COUNTRIES_COLUMN_SQL);
  }
}
