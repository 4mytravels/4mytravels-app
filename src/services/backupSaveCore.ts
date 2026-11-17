// Platform-agnostic core of "Create backup -> save to a file" (no React, no Expo
// imports) so scripts/test-backup-save.mjs can drive every path with fakes.
//
// Policy: the backup is SAVED to a location the user picks (Android: Storage
// Access Framework folder picker, iOS: Files folder picker, web: browser save
// dialog or a plain download). The system share sheet is never opened.

export const BACKUP_MIME = 'application/json';
export const BACKUP_FILE_PREFIX = '4mytravels-backup';

/** `4mytravels-backup-2026-11-16.json` (local date). */
export function backupFileName(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${BACKUP_FILE_PREFIX}-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

export type SaveOutcome =
  | { kind: 'saved'; name: string; location: string | null }
  | { kind: 'downloaded'; name: string }
  | { kind: 'cancelled' };

/** Picker cancellation as thrown by expo-file-system (Android
 * ERR_PICKER_CANCELLED / iOS FilePickingCancelledException) or by the web
 * File System Access API (AbortError). */
export function isCancelError(e: unknown): boolean {
  const o = (e ?? {}) as { name?: unknown; code?: unknown; message?: unknown };
  if (o.name === 'AbortError') return true;
  const s = `${String(o.code ?? '')} ${String(o.message ?? '')}`.toLowerCase();
  return s.includes('cancel');
}

/** `name`, else `name (2).json`, ... — never overwrite an older backup. */
export function uniqueName(name: string, existing: string[]): string {
  const taken = new Set(existing);
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 2; ; i++) {
    const n = `${base} (${i})${ext}`;
    if (!taken.has(n)) return n;
  }
}

// ---------- native (expo-file-system Directory.pickDirectoryAsync) ----------

export interface NativeSaveDeps {
  /** Opens the system folder picker; rejects on cancel. */
  pickDirectory(): Promise<{ label: string | null }>;
  /** Names already present in the picked folder. */
  listNames(): string[];
  /** Creates `name` in the picked folder and writes `content`. */
  writeFile(name: string, mime: string, content: string): void;
}

export async function saveBackupNative(
  content: string,
  deps: NativeSaveDeps,
  now: Date = new Date(),
): Promise<SaveOutcome> {
  let dir: { label: string | null };
  try {
    dir = await deps.pickDirectory();
  } catch (e) {
    if (isCancelError(e)) return { kind: 'cancelled' };
    throw e;
  }
  let existing: string[] = [];
  try { existing = deps.listNames(); } catch { /* listing is best effort */ }
  const name = uniqueName(backupFileName(now), existing);
  deps.writeFile(name, BACKUP_MIME, content);
  return { kind: 'saved', name, location: dir.label };
}

// ---------- web (showSaveFilePicker, download fallback) ----------

export interface WebSaveDeps {
  /** File System Access API save dialog; absent on Firefox/Safari/Android Chrome. */
  showSaveFilePicker?: (name: string, mime: string) => Promise<{ write(content: string): Promise<void> }>;
  download(content: string, name: string, type: string): void;
}

export async function saveBackupWeb(
  content: string,
  deps: WebSaveDeps,
  now: Date = new Date(),
): Promise<SaveOutcome> {
  const name = backupFileName(now);
  if (deps.showSaveFilePicker) {
    try {
      const handle = await deps.showSaveFilePicker(name, BACKUP_MIME);
      await handle.write(content);
      return { kind: 'saved', name, location: null };
    } catch (e) {
      const n = (e as { name?: string } | null)?.name;
      if (n === 'AbortError') return { kind: 'cancelled' };
      // SecurityError/NotAllowedError: the user activation expired during the
      // Argon2 key derivation. Fall through to a download so the backup is not lost.
      if (n !== 'SecurityError' && n !== 'NotAllowedError') throw e;
    }
  }
  deps.download(content, name, BACKUP_MIME);
  return { kind: 'downloaded', name };
}
