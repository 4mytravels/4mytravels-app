// Web/PWA storage adapter — in-memory fallback used until the real PWA engine
// (sqlite.org WASM + SQLite3MC, OPFS-sahpool + IndexedDB fallback) is wired in a
// later step (MVP scope §2.2). This keeps `npx expo start --web` runnable today
// and exercises the exact same StorageAdapter interface the native build uses.
//
// NOTE: this file is only bundled on web (Metro .web resolution).

import type { StorageAdapter, DatabaseConfig } from './types';
import { runMigrations } from './migrations';

// Minimal in-memory SQL-ish store. It implements just enough of the interface
// (CREATE TABLE IF NOT EXISTS, INSERT, SELECT *) to back the app on web during
// development. It is NOT encrypted — that is the PWA-wasm engine's job.
type Row = Record<string, unknown>;
interface Table {
  columns: string[];
  rows: Row[];
  indexes: Set<string>;
}

export class WebStorageAdapter implements StorageAdapter {
  private tables = new Map<string, Table>();
  private schemaVersion = 0;

  async init(_config: DatabaseConfig): Promise<void> {
    const exec = async (sql: string) => this.exec(sql);
    await runMigrations(
      exec,
      async () => this.schemaVersion,
      async (v) => {
        this.schemaVersion = v;
      },
    );
  }

  async exec(sql: string, _params?: unknown[]): Promise<void> {
    const stmt = sql.trim();
    if (/^CREATE TABLE IF NOT EXISTS (\w+)/i.test(stmt)) {
      const name = stmt.match(/^CREATE TABLE IF NOT EXISTS (\w+)/i)![1];
      if (!this.tables.has(name)) this.tables.set(name, { columns: [], rows: [], indexes: new Set() });
      const colDefs = stmt.match(/\(([\s\S]*)\)/)?.[1] ?? '';
      const cols = colDefs
        .split(',')
        .map((c) => c.trim().split(/\s+/)[0])
        .filter((c) => c && !c.toUpperCase().startsWith('FOREIGN') && !c.toUpperCase().startsWith('PRIMARY'));
      this.tables.get(name)!.columns = cols;
      return;
    }
    if (/^CREATE INDEX IF NOT EXISTS (\w+)/i.test(stmt)) {
      const name = stmt.match(/^CREATE INDEX IF NOT EXISTS (\w+)/i)![1];
      // no-op for memory store; index names tracked loosely
      void name;
      return;
    }
    if (/^INSERT OR REPLACE INTO (\w+)/i.test(stmt) || /^INSERT INTO (\w+)/i.test(stmt)) {
      const name = (stmt.match(/^INSERT(?: OR REPLACE)? INTO (\w+)/i) || [])[1];
      const t = this.tables.get(name);
      if (t) {
        // Naive column extraction from the INSERT column list + bound params.
        const colsMatch = stmt.match(/\(([^)]*)\)\s*VALUES/i)?.[1] ?? '';
        const cols = colsMatch.split(',').map((c) => c.trim());
        const params = (_params as unknown[]) ?? [];
        const row: Row = {};
        cols.forEach((c, i) => {
          row[c] = params[i];
        });
        // INSERT OR REPLACE: replace an existing row with the same primary key
        // (first column, conventionally `id`) instead of appending a duplicate.
        const pkCol = cols[0];
        const pkVal = params[0];
        const existingIdx = t.rows.findIndex((r) => r[pkCol] === pkVal);
        if (existingIdx >= 0) {
          t.rows[existingIdx] = row;
        } else {
          t.rows.push(row);
        }
      }
      return;
    }
    if (/^VACUUM/i.test(stmt)) return;
    if (/^UPDATE (\w+)/i.test(stmt)) {
      const name = stmt.match(/^UPDATE (\w+)/i)![1];
      const t = this.tables.get(name);
      if (t) {
        const setCols = stmt.match(/SET\s+([\s\S]*?)\s+WHERE/i)?.[1] ?? '';
        const setNames = setCols.split(',').map((c) => c.trim().split(/\s+/)[0]);
        const whereId = (stmt.match(/WHERE id = \?/i) || [])[0];
        const params = (_params as unknown[]) ?? [];
        const idVal = params[params.length - 1];
        const row = t.rows.find((r) => r.id === idVal);
        if (row) {
          setNames.forEach((col, i) => {
            row[col] = params[i];
          });
        }
      }
      return;
    }
    if (/^DELETE FROM (\w+)/i.test(stmt)) {
      const name = stmt.match(/^DELETE FROM (\w+)/i)![1];
      const t = this.tables.get(name);
      if (t) {
        const wm = stmt.match(/WHERE\s+(\w+)\s*=\s*\?/i);
        const params = (_params as unknown[]) ?? [];
        if (wm && params.length > 0) {
          const col = wm[1];
          const val = params[0];
          t.rows = t.rows.filter((r) => r[col] !== val);
        } else {
          t.rows = [];
        }
      }
      return;
    }
    // ignore other statements (CREATE TABLE without IF NOT EXISTS, etc.)
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    const m = sql.match(/FROM (\w+)/i);
    if (m && this.tables.has(m[1])) {
      let rows = this.tables.get(m[1])!.rows as T[];
      // Minimal WHERE col = ? support so loadExpenses(tripId) filters correctly.
      const wm = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
      if (wm && params && params.length > 0) {
        const col = wm[1];
        const val = params[0];
        rows = rows.filter((r) => (r as Record<string, unknown>)[col] === val) as T[];
      }
      return rows;
    }
    return [] as T[];
  }

  async compact(): Promise<void> {
    // no-op in memory
  }

  async close(): Promise<void> {
    // keep data in memory for dev reloads; real impl would zero the key
  }

  isEncrypted(): boolean {
    return false; // PWA-wasm engine will return true
  }
}
