// Storage error types that are safe to import from ANY platform.
//
// Do NOT put these in storage.native.ts: that module imports op-sqlite, and
// importing it from shared code (e.g. useStorage.ts) would pull the native
// module into the web bundle, breaking the Metro .web/.native split that keeps
// op-sqlite out of the PWA build (see src/db/index.ts).

/**
 * Raised when the native library was built WITHOUT SQLCipher. Never swallow
 * this: an unencrypted local database violates the app's privacy contract
 * (AGENTS.md "local-only", §2.2 "all local data is encrypted").
 */
export class EncryptionUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncryptionUnavailableError';
  }
}

/**
 * Raised when an existing database cannot be opened with a key because it was
 * written without one. SQLCipher reports SQLITE_NOTADB ("file is not a
 * database") when it reads the header of a plaintext file.
 */
export class LegacyPlaintextDatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LegacyPlaintextDatabaseError';
  }
}

/**
 * True when the error means "this file was not written by SQLCipher".
 * SQLite surfaces this as SQLITE_NOTADB; both the numeric code and the message
 * text appear depending on how deep the failure happened (sqlite3_open_v2 vs.
 * the first actual page read).
 */
export function isNotADatabaseError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { code?: unknown; message?: unknown };
  if (e.code === 26 || e.code === '26') return true; // SQLITE_NOTADB
  const msg = typeof e.message === 'string' ? e.message.toLowerCase() : '';
  return msg.includes('not a database') || msg.includes('file is encrypted');
}