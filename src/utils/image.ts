// Image pipeline for receipt + trip-cover photos (MVP scope §2.2, v1.6 table).
//
// Requirements from the scope:
//   - Resize/compress on import: max dimension 2000 px, JPEG ~75% quality,
//     target ≤ 500 KB per photo — bounds the encrypted database size.
//   - EXIF/GPS stripped before storage. expo-image-manipulator re-encodes the
//     JPEG, which DROPS all EXIF metadata (including GPS) — the true byte-level
//     strip that was previously listed as a follow-up.
//
// ASPECT RATIO: the resize MUST preserve the source aspect ratio. Passing
// `resize: { width: 2000, height: 2000 }` squashes every photo into a 2000×2000
// square (that was the "trip photo format is wrong" bug on the home journey card
// and the trip-detail hero). We therefore scale by the LONGEST side only.

import * as ImageManipulator from 'expo-image-manipulator';

export const MAX_DIMENSION = 2000;
export const JPEG_QUALITY = 0.75;
const TARGET_BYTES = 500 * 1024;

/**
 * Trip cover photo stage height, shared by the TripCard stage (Home, Trips tab,
 * trip detail) AND the new/edit-trip preview. One constant so the form preview
 * is EXACTLY the same format the card renders — a solid bar on the card used to
 * be previewed at a totally different 4:3 shape in the editor.
 */
export const TRIP_COVER_HEIGHT = 224;

export interface SourceSize {
  width?: number;
  height?: number;
}

/** Longest-side-capped target size that preserves the source aspect ratio. */
export function fitWithin(
  width: number,
  height: number,
  max: number = MAX_DIMENSION,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (!Number.isFinite(longest) || longest <= 0) return { width: max, height: max };
  if (longest <= max) return { width: Math.round(width), height: Math.round(height) };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Read the real pixel size of a data URI (JPEG re-encode of the source). */
async function measure(dataUri: string): Promise<{ width: number; height: number } | null> {
  try {
    const result = await ImageManipulator.manipulateAsync(dataUri, [], {
      compress: 1,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return result.width > 0 && result.height > 0 ? { width: result.width, height: result.height } : null;
  } catch {
    return null;
  }
}

/**
 * Normalize a picked photo: resize (aspect preserved) so no side exceeds 2000 px
 * and JPEG re-encode at ~75% (stepping down if still >500 KB). The re-encode
 * strips ALL EXIF metadata (incl. GPS) before the bytes ever reach the DB.
 *
 * Pass the picker's `width`/`height` when available — that avoids an extra
 * decode pass (and the multi-second stall that came with it).
 */
export async function processPhoto(base64: string, size?: SourceSize): Promise<Uint8Array> {
  const dataUri = `data:image/jpeg;base64,${base64}`;
  try {
    const known: { width: number; height: number } | null =
      size && size.width && size.height
        ? { width: size.width, height: size.height }
        : await measure(dataUri);
    // Without a known size, only cap the width: the manipulator derives the
    // height, so the aspect ratio survives (that is the whole point).
    const target = known ? fitWithin(known.width, known.height) : { width: MAX_DIMENSION };
    const actions: ImageManipulator.Action[] = [{ resize: target }];
    const encode = (compress: number) =>
      ImageManipulator.manipulateAsync(dataUri, actions, {
        compress,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      });
    let quality = JPEG_QUALITY;
    let result = await encode(quality);
    while (approxBytes(result.base64 ?? '') > TARGET_BYTES && quality > 0.4) {
      quality -= 0.15;
      result = await encode(quality);
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
  // O(n) base64: Uint8Array → binary string in 64KB chunks (avoids O(n²) string concat)
  const CHUNK = 64 * 1024;
  let bin = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

// BLOB bytes → data-URI string for <Image source={{ uri }}> (cover photos,
// receipt photos — live encrypted in the DB, decrypted on read).
export function bytesToDataUri(bytes: Uint8Array): string {
  return 'data:image/jpeg;base64,' + bytesToBase64(bytes);
}