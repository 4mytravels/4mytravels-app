// Web/PWA: browser save dialog where supported (showSaveFilePicker), else a
// plain download to the browser's download folder. Never navigator.share.
import { saveBackupWeb, type SaveOutcome } from './backupSaveCore';

type PickerWindow = Window & {
  showSaveFilePicker?: (opts: unknown) => Promise<{
    createWritable(): Promise<{ write(d: Blob): Promise<void>; close(): Promise<void> }>;
  }>;
};

export function saveBackup(content: string): Promise<SaveOutcome> {
  const w = typeof window !== 'undefined' ? (window as PickerWindow) : undefined;
  const picker = w?.showSaveFilePicker?.bind(w);
  return saveBackupWeb(content, {
    showSaveFilePicker: picker
      ? async (name, mime) => {
          const handle = await picker({
            suggestedName: name,
            types: [{ description: '4MyTravels backup', accept: { [mime]: ['.json'] } }],
          });
          return {
            write: async (text) => {
              const s = await handle.createWritable();
              await s.write(new Blob([text], { type: mime }));
              await s.close();
            },
          };
        }
      : undefined,
    download: (text, name, type) => {
      const url = URL.createObjectURL(new Blob([text], { type }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
  });
}
