// M7 — storage policy for GDPR erasure (decision V3, MatthyB 2026-11-17):
// `secure_delete = ON` + `auto_vacuum = INCREMENTAL` instead of a full VACUUM
// on every trip delete.
//
// - secure_delete is PER CONNECTION and is not stored in the file, so it must
//   be set on every open. With it on, SQLite overwrites deleted cell content
//   and freed pages with zeros, so a deleted expense is not recoverable from
//   the DB pages even before any vacuum runs.
// - auto_vacuum IS stored in the file header, but changing it on an EXISTING
//   database only takes effect after a full VACUUM (SQLite docs: "auto-vacuum
//   must be turned on before any tables are created" or followed by VACUUM).
//   So the first open after this release runs ONE VACUUM (migration); every
//   later open sees mode 2 and skips it.
// - After a delete, `PRAGMA incremental_vacuum` hands the (already zeroed)
//   free pages back to the OS so the file shrinks — cheap, no full rewrite.
//
// The web worker (public/sqlite-worker.js, plain JS, not Metro-bundled) mirrors
// this exact sequence in `applyStoragePolicy()`. Keep the two in sync.

export const AUTO_VACUUM_INCREMENTAL = 2;

type Exec = (sql: string) => Promise<unknown>;
type Query = (sql: string) => Promise<Record<string, unknown>[]>;

function firstNumber(rows: Record<string, unknown>[]): number {
  const row = rows[0];
  if (!row) return NaN;
  const v = Object.values(row)[0];
  return typeof v === 'number' ? v : Number(v);
}

/**
 * Run on every open, BEFORE migrations. Returns `migrated: true` when this
 * call converted an existing database to incremental auto-vacuum (one VACUUM).
 */
export async function applyStoragePolicy(exec: Exec, query: Query): Promise<{ migrated: boolean }> {
  await exec('PRAGMA secure_delete = ON');
  const mode = firstNumber(await query('PRAGMA auto_vacuum'));
  if (mode === AUTO_VACUUM_INCREMENTAL) return { migrated: false };
  await exec('PRAGMA auto_vacuum = INCREMENTAL');
  // Required for an existing file; a fresh (empty) file takes the mode
  // immediately and the VACUUM is a no-op.
  await exec('VACUUM');
  return { migrated: true };
}

/** After a delete: return the zeroed free pages to the OS (no full rewrite). */
export async function reclaimFreePages(exec: Exec): Promise<void> {
  await exec('PRAGMA incremental_vacuum');
}
