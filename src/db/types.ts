// Storage abstraction — defined once, implemented twice (MVP scope §3).
//
// Implementations (platform-specific via Metro's .native / .web resolution):
//   - storage.native.ts : @op-engineering/op-sqlite + SQLCipher (Android/iOS),
//                         key from the OS secure enclave (Android Keystore via
//                         expo-secure-store). Opens with `encryptionKey`, which is
//                         op-sqlite's SQLCipher `PRAGMA key=` equivalent.
//   - storage.web.ts     : in-memory adapter for the PWA/dev web target. The real
//                         PWA engine (sqlite.org WASM + SQLite3MC, OPFS-sahpool +
//                         IndexedDB fallback) lands in a later step; until then
//                         web uses a memory-backed store so the app runs.
//
// Both MUST pass the same `PRAGMA key=` unlock test (acceptance §2.5). Both store
// receipt/cover photos as blobs (ArrayBuffer) inside the encrypted database.

export interface DatabaseConfig {
  // Native: ignored — the key lives in the secure enclave (Android Keystore).
  // Web/PWA: the Argon2-derived passphrase used as the session key (§2.2).
  passphrase?: string;
  // Web only: open in memory-and-persist (session-held key) mode.
  ephemeralSession?: boolean;
}

export interface StorageAdapter {
  /** Open + unlock the encrypted database. Throws on wrong key. */
  init(config: DatabaseConfig): Promise<void>;
  /** Run a write (INSERT/UPDATE/DELETE). */
  exec(sql: string, params?: unknown[]): Promise<void>;
  /** Query rows. */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Close + zero the in-memory session key (web). */
  close(): Promise<void>;
  /** VACUUM/compact so deleted ciphertext does not linger (GDPR erasure, §2.2). */
  compact(): Promise<void>;
  /** Whether the backend is SQLCipher-encrypted (acceptance §2.5). */
  isEncrypted(): boolean;
}

// Schema version — migrations run from the first build.
export const SCHEMA_VERSION = 1;
