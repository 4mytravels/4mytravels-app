// Typed main-thread client for public/sqlite-worker.js (Task 2).
//
// One worker per adapter instance; requests are correlated by id with a
// 30s timeout. The worker is loaded from the app origin root so it works
// both on the Expo dev server and in the static export.

import type { WorkerRequest, WorkerResponse } from './protocol';
import { WorkerDbError } from './protocol';

const REQUEST_TIMEOUT_MS = 30_000;

export class SqliteWorkerClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, {
    resolve: (r: WorkerResponse) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private logSink: ((line: string) => void) | null = null;

  constructor(workerUrl = '/sqlite-worker.js') {
    this.worker = new Worker(workerUrl);
    this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) => this.handleMessage(ev.data);
    this.worker.onerror = (ev) => {
      // Worker crashed (script load failure etc.) — fail all pending calls.
      const err = new Error('sqlite worker error: ' + (ev.message || 'unknown'));
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(err);
      }
      this.pending.clear();
    };
  }

  /** Subscribe to worker log lines (fallback notices etc.). */
  onLog(sink: (line: string) => void): void {
    this.logSink = sink;
  }

  private handleMessage(msg: WorkerResponse) {
    if (msg.log !== undefined) {
      this.logSink?.(msg.log);
      return;
    }
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.ok) {
      p.resolve(msg);
    } else {
      p.reject(new WorkerDbError(msg.error || 'worker error', msg.code));
    }
  }

  call(op: WorkerRequest['op'], extra: Partial<WorkerRequest> = {}): Promise<WorkerResponse> {
    const id = this.nextId++;
    const req: WorkerRequest = Object.assign({ id, op }, extra);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`sqlite worker timeout on op '${op}'`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage(req);
    });
  }

  terminate(): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error('worker terminated'));
    }
    this.pending.clear();
    this.worker.terminate();
  }
}
