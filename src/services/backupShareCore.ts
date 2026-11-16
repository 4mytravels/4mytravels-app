// Platform-agnostic core of "Create backup → share" (no React, no Expo imports)
// so scripts/test-backup-share.mjs can drive every path with fakes.
//
// Policy: the backup is never saved to a user-visible location. It is handed
// to the platform share sheet; any temp copy is deleted afterwards — also when
// the user cancels. Only when the platform cannot share files at all do we
// fall back to a plain download (see shareBackupWeb).

export const BACKUP_MIME = 'application/json';
export const BACKUP_FILE_PREFIX = '4mytravels-backup';

/** `4mytravels-backup-2026-11-16.json` (local date). */
export function backupFileName(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${BACKUP_FILE_PREFIX}-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

export function isBackupTempName(name: string): boolean {
  return name.startsWith(BACKUP_FILE_PREFIX) && name.endsWith('.json');
}

export type ShareOutcome = 'shared' | 'cancelled' | 'downloaded';

// ---------- native (expo-file-system cache + expo-sharing) ----------

export interface NativeShareDeps {
  isAvailable(): Promise<boolean>;
  /** Names of files currently in the cache dir (for stale-copy cleanup). */
  listCache(): string[];
  writeTemp(name: string, content: string): string; // returns uri
  deleteTemp(name: string): void;
  share(uri: string, opts: { mimeType: string; dialogTitle: string; UTI?: string }): Promise<void>;
}

export async function shareBackupNative(
  content: string,
  deps: NativeShareDeps,
  now: Date = new Date(),
): Promise<ShareOutcome> {
  // Safety net: remove copies a crash/kill may have left behind earlier.
  for (const n of deps.listCache()) {
    if (isBackupTempName(n)) {
      try { deps.deleteTemp(n); } catch { /* best effort */ }
    }
  }
  if (!(await deps.isAvailable())) {
    throw new Error('Sharing is not available on this device.');
  }
  const name = backupFileName(now);
  const uri = deps.writeTemp(name, content);
  try {
    // expo-sharing resolves both when a target was picked and when the sheet
    // was dismissed (Android cannot tell them apart) — either way: no toast.
    await deps.share(uri, { mimeType: BACKUP_MIME, dialogTitle: 'Share encrypted backup', UTI: 'public.json' });
    return 'shared';
  } finally {
    try { deps.deleteTemp(name); } catch { /* best effort */ }
  }
}

// ---------- web (Web Share API level 2, download fallback) ----------

export interface WebShareDeps {
  makeFile(content: string, name: string, type: string): unknown;
  canShare?: (data: { files: unknown[] }) => boolean;
  share?: (data: { files: unknown[]; title?: string }) => Promise<void>;
  download(content: string, name: string, type: string): void;
}

export async function shareBackupWeb(
  content: string,
  deps: WebShareDeps,
  now: Date = new Date(),
): Promise<ShareOutcome> {
  const name = backupFileName(now);
  const file = deps.makeFile(content, name, BACKUP_MIME);
  const data = { files: [file], title: '4MyTravels backup' };
  if (deps.share && deps.canShare?.(data)) {
    try {
      await deps.share(data);
      return 'shared';
    } catch (e) {
      const n = (e as { name?: string } | null)?.name;
      if (n === 'AbortError') return 'cancelled'; // user closed the sheet: silent
      // NotAllowedError: transient user activation expired during Argon2
      // (Chrome allows ~5 s), or a policy block. Fall through to download so
      // the user still gets the backup. Anything else: rethrow.
      if (n !== 'NotAllowedError') throw e;
    }
  }
  // FALLBACK: desktop browsers (Firefox, most desktop Chrome/Linux) have no
  // file sharing via navigator.share. A download is the only way to hand the
  // file over there; it is in-memory (blob URL), nothing is stored in the app.
  deps.download(content, name, BACKUP_MIME);
  return 'downloaded';
}
