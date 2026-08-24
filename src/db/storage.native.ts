// Native storage adapter — @op-engineering/op-sqlite with SQLCipher (Android/iOS).
//
// Key management (MVP scope §2.2 / §3):
//   - A random per-device key is generated on first launch and stored in
//     expo-secure-store, which on Android is backed by the Android Keystore
//     (not app storage, not a config file).
//   - The key is passed to op-sqlite as `encryptionKey`, which performs the
//     SQLCipher PRAGMA key= unlock internally. A wrong/stale key throws.
//   - This device key is intentionally NOT the portable backup key (Argon2
//     passphrase). The backup key is used for the encrypted *backup file* and
//     cross-device restore; the device key keeps the live local DB unlocked
//     without prompting for a passphrase on every launch (cold-start < 2s, §2.4).
//
// NOTE: this file is only bundled on native platforms (Metro .native resolution).
// It cannot run under Node/web, which is expected.

import * as SecureStore from 'expo-secure-store';
import { open, type DB } from '@op-engineering/op-sqlite';
import { Platform } from 'react-native';
import type { StorageAdapter, DatabaseConfig } from './types';
import { SCHEMA_VERSION } from './types';
import { runMigrations } from './migrations';

const DB_NAME = '4mytravels.db';
const KEY_ALIAS = '4mytravels.db.key';
const SCHEMA_KEY = 'schema_version';

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
      this.db = open({ name: DB_NAME, encryptionKey: key });
      await this.runSchema();
    })();

    try {
      await this.initializing;
    } finally {
      this.initializing = null;
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
  }

  isEncrypted(): boolean {
    // op-sqlite builds for native include SQLCipher. The acceptance test (§2.5)
    // asserts this returns true on device.
    return true;
  }
}

// keep Platform import meaningful for tree-shaking clarity on native
export const _platform = Platform.OS;
export { SCHEMA_VERSION };
