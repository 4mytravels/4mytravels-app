// Web storage adapter selector (PWA / dev web). Metro resolves this file when
// the platform is web. The native op-sqlite module is never imported here.
import { WebStorageAdapter } from './storage.web';
import type { StorageAdapter } from './types';

let adapter: StorageAdapter | null = null;
export function getStorageAdapter(): StorageAdapter {
  if (!adapter) adapter = new WebStorageAdapter();
  return adapter;
}
