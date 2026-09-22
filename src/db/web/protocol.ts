// Worker RPC protocol — mirrors public/sqlite-worker.js (kept deliberately
// loose-coupled: the worker is plain JS outside Metro, so these types are the
// single source of truth for the main-thread side).

export interface WorkerRequest {
  id: number;
  op: 'open' | 'exec' | 'query' | 'compact' | 'close' | 'health' | 'exportDb' | 'importDb' | 'getSalt';
  dbName?: string;
  keyHex?: string;
  sql?: string;
  params?: unknown[];
  bytes?: ArrayBuffer;
}

export interface WorkerResponse {
  id: number;
  ok: boolean;
  error?: string;
  /** SQLite result code string, e.g. 'SQLITE_NOTADB' on a wrong key. */
  code?: string;
  vfs?: 'sahpool' | 'idb' | 'memory' | 'unknown';
  isNew?: boolean;
  rows?: Record<string, unknown>[];
  changes?: number;
  persisted?: boolean | null;
  bytes?: ArrayBuffer;
  salt?: string;
  /** Unsolicited log line from the worker (e.g. fallback notice). */
  log?: string;
}

/** Error class carrying the SQLite result code from the worker. */
export class WorkerDbError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'WorkerDbError';
    this.code = code;
  }
}
