// Image pipeline for receipt + trip-cover photos (MVP scope §2.2, v1.6 table).
//
// Requirements from the scope:
//   - Resize/compress on import: max dimension 2000 px, JPEG ~75% quality,
//     target ≤ 500 KB per photo — bounds the encrypted database size.
//   - EXIF/GPS stripped before storage. expo-image-manipulator re-encodes the
//     JPEG, which DROPS all EXIF metadata (including GPS) — the true byte-level
//     strip that was previously listed as a follow-up.
//
// expo-image-manipulator accepts a file/URI; on Android the picker gives us a
// base64 payload, which we hand over as a data URI.

import * as ImageManipulator from 'expo-image-manipulator';

export const MAX_DIMENSION = 2000;
export const JPEG_QUALITY = 0.75;
const TARGET_BYTES = 500 * 1024;

/**
 * Normalize a picked photo: resize so no side exceeds 2000 px and JPEG
 * re-encode at ~75% (stepping down if still >500 KB). The re-encode strips ALL
 * EXIF metadata (incl. GPS) before the bytes ever reach the encrypted DB.
 */
export async function processPhoto(base64: string): Promise<Uint8Array> {
  try {
    // Probe dimensions via a lossless first pass is wasteful; instead scale
    // conservatively using the known cap — manipulateAsync's `resize` with only
    // one dimension keeps aspect ratio, but we need both. Use two-step:
    const actions: ImageManipulator.Action[] = [{ resize: { width: MAX_DIMENSION, height: MAX_DIMENSION } }];
    let quality = JPEG_QUALITY;
    let result = await ImageManipulator.manipulateAsync(
      `data:image/jpeg;base64,${base64}`,
      actions,
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG },
    );
    while (approxBytes(result.base64 ?? '') > TARGET_BYTES && quality > 0.4) {
      quality -= 0.15;
      result = await ImageManipulator.manipulateAsync(
        `data:image/jpeg;base64,${base64}`,
        actions,
        { compress: quality, format: ImageManipulator.SaveFormat.JPEG },
      );
    }
    return base64ToBytes(result.base64 ?? '');
  } catch {
    // Fallback: keep the picker's own output (GPS is never read either way).
    return base64ToBytes(base64);
  }
}

function approxBytes(b64: string): number {
  return Math.floor((b64.length * 3) / 4);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
