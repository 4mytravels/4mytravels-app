// Web share target bridge — read a file another app shared into 4MyTravels.
//
// WHY THIS EXISTS: the Android document picker hands <input type=file> a
// `content://` PROXY uri from cloud providers (Proton Drive, Dropbox, …). Chrome
// can stat that proxy (name/size/type come through) but cannot read it: every
// read path throws
//   NotReadableError: The requested file could not be read, typically due to
//   permission problems that have occurred after a reference to a file was
//   acquired.
// (verified live 2026-10-28: File.text(), File.arrayBuffer(),
// FileReader.readAsText and readAsArrayBuffer all threw; fetch(objectURL) threw
// "Failed to fetch"). Local files are fine — only cloud proxies fail.
//
// Sharing is the way around it: the OS delivers the file CONTENT inside the
// share POST body, so the bytes are real. A static host cannot read a request
// body in JS, so public/sw.js intercepts `POST /import`, stores the file text in
// a Cache entry, and 303-redirects to the app. This module reads that entry.
//
// Cache API (not IndexedDB) because the SW and the window share it on the same
// origin and the payload is a single small text blob.
import { Platform } from 'react-native';

/** Cache + key written by public/sw.js — keep the two files in sync. */
export const SHARED_CACHE = '4mytravels-shared';
export const SHARED_KEY = '/__shared-file';

export interface SharedFile {
  name: string;
  text: string;
}

/**
 * Pop the pending shared file, if any. Reading it CLEARS it, so a reload can
 * never import the same share twice.
 */
export async function takeSharedFile(): Promise<SharedFile | null> {
  if (Platform.OS !== 'web') return null;
  const cachesImpl = (globalThis as unknown as { caches?: CacheStorage }).caches;
  if (!cachesImpl) return null;
  try {
    const cache = await cachesImpl.open(SHARED_CACHE);
    const res = await cache.match(SHARED_KEY);
    if (!res) return null;
    const text = await res.text();
    const rawName = res.headers.get('x-shared-name') ?? '';
    let name = 'shared.csv';
    try {
      name = rawName ? decodeURIComponent(rawName) : name;
    } catch {
      /* malformed header — keep the default name */
    }
    // Consume it: a second read must come back empty.
    await cache.delete(SHARED_KEY);
    return { name, text };
  } catch {
    return null;
  }
}

/** True when the share redirect landed with a parse failure in the worker. */
export function sharedErrorFromLocation(): boolean {
  if (Platform.OS !== 'web') return false;
  try {
    return new URLSearchParams(globalThis.location.search).get('shared') === 'error';
  } catch {
    return false;
  }
}

/** Drop the `?shared=…` marker so a reload does not re-report it. */
export function clearSharedMarker(): void {
  if (Platform.OS !== 'web') return;
  try {
    const url = new URL(globalThis.location.href);
    url.searchParams.delete('shared');
    globalThis.history.replaceState(null, '', url.toString());
  } catch {
    /* ignore */
  }
}
