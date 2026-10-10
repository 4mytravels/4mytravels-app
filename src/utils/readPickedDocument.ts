// Read a picked document's text on BOTH platforms (Settings → Import CSV /
// Restore backup).
//
// WHY THIS EXISTS (the web import bug)
// expo-document-picker returns DIFFERENT things per platform, and the WEB
// variant is a trap:
//   - The web picker wraps the chosen File and exposes:
//       asset.uri  = a `blob:https://…` object URL (URL.createObjectURL)
//       asset.file = the ORIGINAL browser File object
//   - A blob: URL is NOT fetchable under this app's COEP `require-corp` header
//     (measured: `fetch(blobUrl)` throws "Failed to fetch" even inside the
//     app's own isolated context). So a `fetch(uri).text()` fix does NOT work —
//     that was the first attempt and import still failed.
//   - expo-file-system's `File` has NO web implementation and cannot open a
//     blob: path either.
// The reliable web path is the original `File` object: `File.text()` /
// `FileReader.readAsText` work on it under COEP (verified live). We therefore
// read `asset.file` directly on web. Native (real file:// / content://) keeps
// expo-file-system's `File().text()` (it handles content:// from cloud
// providers, which the browser File API cannot).

import { File } from 'expo-file-system';
import { Platform } from 'react-native';

/** The picker asset shape we care about (superset of the SDK type). */
export type PickedAssetLike = {
  uri?: string;
  /** web only: the original browser File object the picker also returns. */
  file?: unknown;
};

/**
 * Read a picked document's text.
 * @param asset the picked asset (`doc.assets[0]`) — pass the OBJECT, not just
 *              the uri, so the web path can use `asset.file`.
 */
export async function readPickedDocumentText(asset: PickedAssetLike): Promise<string> {
  const uri = typeof asset?.uri === 'string' ? asset.uri : '';

  // WEB: use the original File object when present — a blob: URL is not
  // fetchable under COEP require-corp, but the File itself reads fine.
  if (Platform.OS === 'web') {
    const webFile = asset?.file as Blob | undefined;
    if (webFile && typeof webFile.text === 'function') {
      return webFile.text();
    }
    if (webFile && typeof webFile.arrayBuffer === 'function') {
      const buf = await webFile.arrayBuffer();
      return new TextDecoder().decode(buf);
    }
    // Last resort: FileReader on the File object (older Safari).
    if (webFile && typeof FileReader !== 'undefined') {
      const text = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result ?? ''));
        fr.onerror = () => reject(fr.error ?? new Error('read failed'));
        fr.readAsText(webFile);
      });
      return text;
    }
    throw new Error('Could not read the selected file on web (no File object).');
  }

  // Native path: real file:// / content:// path via expo-file-system.
  if (!uri) throw new Error('No file was selected.');
  const file = new File(uri);
  return file.text();
}
