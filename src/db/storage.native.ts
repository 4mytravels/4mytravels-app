// Native storage adapter — @op-engineering/op-sqlite with SQLCipher (Android/iOS).
//
// KEY MANAGEMENT (MVP scope §2.2 / §3):
//   - A random per-device key is generated on first launch and stored in
//     expo-secure-store, which on Android is backed by the Android Keystore
//     (not app storage, not a config file).
//   - The key is passed to op-sqlite as `encryptionKey`, which reaches
//     `sqlite3_key_v2(db, "main", ...)` in cpp/OPBridge.cpp. A wrong/stale key
//     throws.
//   - This device key is intentionally NOT the portable backup key (Argon2
//     passphrase). The backup key is used for the encrypted *backup file* and
//     cross-device restore; the device key keeps the live local DB unlocked
//     without prompting for a passphrase on every launch (cold-start < 2s, §2.4).
//
// SQLCIPHER IS A COMPILE-TIME OPT-IN — do not assume it is present.
//   CMakeLists.txt only compiles cpp/sqlcipher/sqlite3.c and only calls
//   sqlite3_key_v2() when the build was configured with `sqlcipher: true` in
//   the "op-sqlite" block of package.json. Without it the build links plain
//   cpp/sqlite3.c and OPBridge opens the file WITHOUT a key — the
//   `encryptionKey` option is then silently discarded and the database is
//   written in the clear. That regression is invisible from JS, so init()
//   probes the open connection and throws instead of pretending.
//
// NOTE: this file is only bundled on native platforms (Metro .native resolution).
// It cannot run under Node/web, which is expected.

import * as SecureStore from 'expo-secure-store';
import { open, isSQLCipher, type DB } from '@op-engineering/op-sqlite';
import { Platform } from 'react-native';
import type { StorageAdapter, DatabaseConfig } from './types';
import { SCHEMA_VERSION } from './types';
import { runMigrations } from './migrations';
import {
  EncryptionUnavailableError,
  LegacyPlaintextDatabaseError,
  isNotADatabaseError,
} from './errors';

const DB_NAME = '4mytravels.db';
const KEY_ALIAS = '4mytravels.db.key';
const SCHEMA_KEY = 'schema_version';

export { EncryptionUnavailableError, LegacyPlaintextDatabaseError };

function generateKey(): string {
  // 32-byte hex key for SQLCipher.
  const bytes = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export class NativeStorageAdapter implements StorageAdapter {
  private db: DB | null = null;
  private initializing: Promise<void> | null = null;
  private encrypted: boolean = false;

  async init(_config: DatabaseConfig): Promise<void> {
    // Idempotent + guards against concurrent init() calls (multiple
    // useStorageInit mounts) racing on the same SQLCipher database, which
    // previously could leave the DB locked and make later writes hang.
    if (this.db) return;
    if (this.initializing) return this.initializing;

    this.initializing = (async () => {
      let key: string | null = null;
      try {
        key = await SecureStore.getItemAsync(KEY_ALIAS);
      } catch {
        key = null;
      }
      if (!key) {
        key = generateKey();
        try {
          await SecureStore.setItemAsync(KEY_ALIAS, key);
        } catch {
          // ignore — key stays in memory for this session
        }
      }

      // Compile-time gate. isSQLCipher() is answered by the native module from
      // the same #ifdef that decides whether sqlite3_key_v2() is ever called,
      // so this is a true statement about the running binary — not a guess.
      if (!isSQLCipher()) {
        throw new EncryptionUnavailableError(
          'This build was compiled WITHOUT SQLCipher, so the local database ' +
            'would be stored in the clear. Rebuild with "op-sqlite": { ' +
            '"sqlcipher": true } in package.json (a native rebuild is ' +
            'required — a JS reload is not enough).',
        );
      }

      try {
        this.db = open({ name: DB_NAME, encryptionKey: key });
      } catch (e) {
        if (isNotADatabaseError(e)) {
          throw new LegacyPlaintextDatabaseError(
            'The existing database on this device was written without ' +
              'encryption and cannot be opened with a key. Clear the app ' +
              'storage (or uninstall the app) to start a fresh encrypted ' +
              'database.',
          );
        }
        throw e;
      }

      // Runtime confirmation on the live connection: SQLCipher answers
      // `PRAGMA cipher_version` with its version string; plain SQLite has no
      // such pragma and returns no rows. A key that failed to apply would
      // also fail the first statement below, so reaching this point means the
      // key was accepted.
      this.encrypted = await this.probeCipher();
      if (!this.encrypted) {
        await this.close();
        throw new EncryptionUnavailableError(
          'SQLCipher is compiled in, but the open database reports no cipher. ' +
            'The encryption key was not applied — refusing to continue with an ' +
            'unencrypted database.',
        );
      }

      await this.runSchema();
    })();

    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  /** `PRAGMA cipher_version` — non-empty only on a keyed SQLCipher connection. */
  private async probeCipher(): Promise<boolean> {
    if (!this.db) return false;
    try {
      const res = await this.db.execute('PRAGMA cipher_version');
      const value = res.rows?.[0] as { cipher_version?: unknown } | undefined;
      const v = value?.cipher_version;
      return typeof v === 'string' && v.length > 0;
    } catch {
      // Plain SQLite treats an unknown pragma as a no-op returning no rows,
      // so an empty result (not an exception) is the negative signal.
      return false;
    }
  }

  private async runSchema(): Promise<void> {
    if (!this.db) throw new Error('DB not open');
    const exec = async (sql: string) => {
      await this.db!.execute(sql);
    };
    const getVersion = async (): Promise<number> => {
      const res = await this.db!.execute(
        'SELECT value FROM _schema WHERE key = ?',
        [SCHEMA_KEY],
      );
      const row = res.rows?.[0] as { value?: string } | undefined;
      return row?.value ? parseInt(row.value, 10) : 0;
    };
    const setVersion = async (v: number) => {
      await this.db!.execute(
        'INSERT INTO _schema (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?',
        [SCHEMA_KEY, String(v), String(v)],
      );
    };
    await runMigrations(exec, getVersion, setVersion);
  }

  async exec(sql: string, params?: unknown[]): Promise<void> {
    if (!this.db) throw new Error('Storage not initialized — call init() first');
    await this.db.execute(sql, (params ?? []) as never[]);
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    if (!this.db) throw new Error('Storage not initialized — call init() first');
    const res = await this.db.execute(sql, (params ?? []) as never[]);
    return (res.rows ?? []) as T[];
  }

  async compact(): Promise<void> {
    if (!this.db) throw new Error('DB not open');
    // VACUUM rewrites the DB file, removing deleted ciphertext (GDPR erasure, §2.2).
    await this.db.execute('VACUUM');
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.closeAsync();
      this.db = null;
    }
    this.encrypted = false;
  }

  isEncrypted(): boolean {
    // Reflects the PRAGMA cipher_version probe done in init(), not a constant.
    // False before init() completes and after close().
    return this.encrypted;
  }
}

// keep Platform import meaningful for tree-shaking clarity on native
export const _platform = Platform.OS;
export { SCHEMA_VERSION };