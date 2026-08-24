// op-sqlite v18 returns BLOB columns as ArrayBuffer; all UI code expects
// Uint8Array (.length indexing + btoa conversion). Normalize on read so
// photos survive an app reload. Shared by trip covers and receipt photos.
export function bytesFromBlob(raw: unknown): Uint8Array | null {
  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (ArrayBuffer.isView(raw)) {
    const view = raw as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  return null;
}
