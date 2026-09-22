// Web/PWA storage adapter — sqlite3mc WASM engine (MVP scope §2.2, plan Task 4).
//
// Replaces the old in-memory WebStorageAdapter. Real encrypted persistence:
//   - OPFS-sahpool VFS (primary, fast, ACID) via public/sqlite-worker.js
//   - IndexedDB snapshot fallback (Safari private browsing, old browsers)
//   - The worker holds the sqlite3mc instance; this adapter is a thin
//     StorageAdapter facade over the worker RPC.
//
// Key model (scope §2.2 "PWA key management"): the live PWA database uses the
// same Argon2id passphrase-derived key as the local backup file. The raw key
// is held only for the session (worker memory); the per-db salt is public and
// stored in localStorage. A wrong passphrase makes the worker's probe SELECT
// fail with SQLITE_NOTADB, which surfaces here as a WrongKeyError.
//
// NOTE: this file is only bundled on web (Metro .web resolution).

import type { StorageAdapter, DatabaseConfig } from './types';
import { runMigrations } from './migrations';
import { SqliteWorkerClient } from './web/sqliteWorkerClient';
import { WorkerDbError } from './web/protocol';
import { deriveKeyHex } from './web/keyDerive';

/** Thrown by init() when the supplied passphrase does not unlock the db. */
export class WrongKeyError extends Error {
  constructor() {
    super('Wrong passphrase — the database could not be unlocked.');
    this.name = 'WrongKeyError';
  }
}

/** VFS mode reported by the worker after open. */
export type WebVfsMode = 'sahpool' | 'idb' | 'memory' | 'unknown';

export class WasmStorageAdapter implements StorageAdapter {
  private client: SqliteWorkerClient | null = null;
  private opened = false;
  private encrypted = false;
  vfs: WebVfsMode = 'unknown';
  /** Set when the worker reported a fallback (for the storage-health banner). */
  lastWorkerLog: string | null = null;

  async init(config: DatabaseConfig): Promise<void> {
    if (this.opened) return;
    if (!config.passphrase) {
      // No passphrase supplied: the app should have shown the unlock gate
      // first (app/_layout.tsx web branch). Fail loudly rather than silently
      // falling back to plaintext memory storage.
      throw new Error('PWA storage requires a passphrase (unlock gate missing?)');
    }

    const client = new SqliteWorkerClient();
    client.onLog((line) => { this.lastWorkerLog = line; });

    // Per-db salt: public, random on first creation, stored in IndexedDB by
    // the worker (robust where localStorage is blocked, e.g. private mode).
    let salt: string;
    try {
      const saltRes = await client.call('getSalt');
      salt = saltRes.salt as string;
    } catch (e) {
      client.terminate();
      throw e;
    }

    const keyHex = await deriveKeyHex(config.passphrase, salt);

    try {
      const res = await client.call('open', { keyHex });
      this.vfs = res.vfs ?? 'unknown';
      this.client = client;
    } catch (e) {
      client.terminate();
      if (e instanceof WorkerDbError && /NOTADB|not a database|decrypt/i.test(e.message)) {
        throw new WrongKeyError();
      }
      throw e;
    }

    // Migrations run against the real engine now — the generic runner works
    // unchanged because exec/query semantics match the native adapter.
    const exec = async (sql: string, params?: unknown[]) => {
      await client.call('exec', { sql, params });
    };
    const getVersion = async (): Promise<number> => {
      const res = await client.call('query', {
        sql: 'SELECT value FROM _schema WHERE key = ?', params: ['schema_version'],
      });
      const row = res.rows?.[0] as { value?: string } | undefined;
      return row?.value ? parseInt(row.value, 10) : 0;
    };
    const setVersion = async (v: number) => {
      await client.call('exec', {
        sql: 'INSERT INTO _schema (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?',
        params: ['schema_version', String(v), String(v)],
      });
    };
    await runMigrations(exec, getVersion, setVersion);

    this.opened = true;
    this.encrypted = true;
  }

  private requireClient(): SqliteWorkerClient {
    if (!this.client || !this.opened) {
      throw new Error('Storage not initialized — call init() first');
    }
    return this.client;
  }

  async exec(sql: string, params?: unknown[]): Promise<void> {
    await this.requireClient().call('exec', { sql, params });
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    const res = await this.requireClient().call('query', { sql, params });
    return (res.rows ?? []) as T[];
  }

  async compact(): Promise<void> {
    await this.requireClient().call('compact');
  }

  async close(): Promise<void> {
    if (this.client) {
      try { await this.client.call('close'); } catch { /* best effort */ }
      this.client.terminate();
      this.client = null;
    }
    this.opened = false;
    this.encrypted = false;
  }

  isEncrypted(): boolean {
    return this.encrypted;
  }
}
