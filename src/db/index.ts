// Platform-agnostic types + a tsc-visible getStorageAdapter.
//
// IMPORTANT: Metro resolves `./index` to `./index.native` or `./index.web`
// (platform extension), so at runtime the correct platform adapter is used and
// op-sqlite never enters the web bundle. tsc (which has no platform resolution)
// resolves `./index` to THIS file, so we define getStorageAdapter here for
// type-checking only. Metro ignores this file in favor of the .native/.web one.
import { WebStorageAdapter } from './storage.web';
import type { StorageAdapter } from './types';

export type { StorageAdapter, DatabaseConfig } from './types';
export { SCHEMA_VERSION } from './types';

let adapter: StorageAdapter | null = null;
export function getStorageAdapter(): StorageAdapter {
  if (!adapter) adapter = new WebStorageAdapter();
  return adapter;
}
