// Web/PWA: write all CSVs into a folder (showDirectoryPicker) where supported,
// else one browser download per file with a small gap (Chrome throttles bursts
// of downloads). Never navigator.share.
export interface CsvFileOut { name: string; text: string }
export type SaveCsvResult = { saved: number; cancelled: boolean; where: string | null };

type DirHandle = {
  name: string;
  getFileHandle(n: string, o: { create: boolean }): Promise<{
    createWritable(): Promise<{ write(d: Blob): Promise<void>; close(): Promise<void> }>;
  }>;
};
type PickerWindow = Window & { showDirectoryPicker?: (o?: unknown) => Promise<DirHandle> };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function saveCsvFiles(files: CsvFileOut[]): Promise<SaveCsvResult> {
  const w = window as PickerWindow;
  if (typeof w.showDirectoryPicker === 'function') {
    let dir: DirHandle | null = null;
    try {
      dir = await w.showDirectoryPicker({ mode: 'readwrite', id: '4mt-csv-export' });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return { saved: 0, cancelled: true, where: null };
      dir = null; // picker refused (SecurityError, iframe …) → plain downloads
    }
    if (dir) {
      let saved = 0;
      for (const f of files) {
        const h = await dir.getFileHandle(f.name, { create: true });
        const s = await h.createWritable();
        await s.write(new Blob([f.text], { type: 'text/csv' }));
        await s.close();
        saved++;
      }
      return { saved, cancelled: false, where: dir.name };
    }
  }
  let saved = 0;
  for (const f of files) {
    const url = URL.createObjectURL(new Blob([f.text], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    saved++;
    if (saved < files.length) await sleep(400);
  }
  return { saved, cancelled: false, where: 'Downloads' };
}
