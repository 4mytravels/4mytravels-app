// Native: let the user pick a folder (Android Storage Access Framework / iOS
// Files document picker) and write the backup there. No share sheet.
import { Directory } from 'expo-file-system';
import { saveBackupNative, type SaveOutcome } from './backupSaveCore';

export function saveBackup(content: string): Promise<SaveOutcome> {
  let dir: Directory | null = null;
  return saveBackupNative(content, {
    pickDirectory: async () => {
      const picked = await Directory.pickDirectoryAsync();
      dir = picked;
      return { label: folderLabel(picked.uri) };
    },
    listNames: () => (dir ? dir.list().map((e) => e.name) : []),
    writeFile: (name, mime, text) => {
      if (!dir) throw new Error('No folder selected.');
      const f = dir.createFile(name, mime);
      f.write(text);
    },
  });
}

/** Human-readable folder name from a SAF tree URI or a file:// URI. */
function folderLabel(uri: string): string | null {
  try {
    const d = decodeURIComponent(uri).replace(/\/+$/, '');
    return d.split(/[/:]/).filter(Boolean).pop() ?? null;
  } catch {
    return null;
  }
}
