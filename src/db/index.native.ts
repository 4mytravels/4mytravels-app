// Native storage adapter selector (Android/iOS). Metro resolves this file when
// the platform is native, keeping op-sqlite out of the web bundle.
import { NativeStorageAdapter } from './storage.native';
import type { StorageAdapter } from './types';

let adapter: StorageAdapter | null = null;
export function getStorageAdapter(): StorageAdapter {
  if (!adapter) adapter = new NativeStorageAdapter();
  return adapter;
}
