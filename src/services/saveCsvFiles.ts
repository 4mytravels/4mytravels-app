// Native: save one or more CSV files into ONE folder the user picks once
// (Android Storage Access Framework via expo-file-system's Directory API,
// same mechanism as saveBackup). No share sheet ("opslaan, niet delen").
import { Directory } from 'expo-file-system';

export interface CsvFileOut { name: string; text: string }
export type SaveCsvResult = { saved: number; cancelled: boolean; where: string | null };

export async function saveCsvFiles(files: CsvFileOut[]): Promise<SaveCsvResult> {
  let dir: Directory | null = null;
  try {
    dir = await Directory.pickDirectoryAsync();
  } catch {
    dir = null; // picker dismissed
  }
  if (!dir) return { saved: 0, cancelled: true, where: null };
  let saved = 0;
  for (const f of files) {
    const file = dir.createFile(f.name, 'text/csv');
    file.write(f.text);
    saved++;
  }
  return { saved, cancelled: false, where: folderLabel(dir.uri) };
}

function folderLabel(uri: string): string | null {
  try {
    const d = decodeURIComponent(uri).replace(/\/+$/, '');
    return d.split(/[/:]/).filter(Boolean).pop() ?? null;
  } catch {
    return null;
  }
}
