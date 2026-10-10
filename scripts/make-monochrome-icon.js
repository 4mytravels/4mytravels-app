#!/usr/bin/env node
/**
 * Generate the Android adaptive-icon MONOCHROME layer.
 *
 * Why this exists: Android 13+ themed icons ("minimal" icon styles, Material
 * You icon packs) draw the app icon from the monochrome layer — the launcher
 * keeps its ALPHA CHANNEL and paints the shape with the system tint. A layer
 * that is a fully opaque rectangle therefore renders as a solid blank/blind
 * square: the app icon looks like it has no image at all.
 *
 * The shipped assets/android-icon-monochrome.png was exactly that — 432x432,
 * 100% opaque white, alpha = 255 everywhere (verified by decoding the pixels).
 *
 * This script rebuilds it from the visible foreground layer, so the monochrome
 * glyph has identical geometry to the icon the user normally sees:
 *   alpha = 0 where the pixel is (near) the dark background,
 *   alpha ~ luminance for the mark itself (antialiased edges stay smooth),
 *   RGB  = white (Android re-tints it; only alpha matters).
 *
 * Run:  npm run icon:mono      (no dependencies — zlib only)
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'android-icon-foreground.png');
const OUT = path.join(ROOT, 'assets', 'android-icon-monochrome.png');

// --- minimal PNG decode (8-bit RGBA, filters 0-4) --------------------------
function decodePng(buf) {
  if (buf.slice(0, 8).toString('binary') !== '\x89PNG\r\n\x1a\n') {
    throw new Error('not a PNG');
  }
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 6;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.slice(pos + 4, pos + 8).toString('ascii');
    const data = buf.slice(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8) throw new Error('only 8-bit PNG supported');
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported color type ${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let prev = Buffer.alloc(stride);
  let i = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[i++];
    const line = Buffer.from(raw.slice(i, i + stride));
    i += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      if (filter === 1) line[x] = (line[x] + a) & 255;
      else if (filter === 2) line[x] = (line[x] + b) & 255;
      else if (filter === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    line.copy(out, y * stride);
    prev = line;
  }
  return { width, height, channels, pixels: out };
}

// --- minimal PNG encode (8-bit RGBA, filter 0) ----------------------------
function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(body), 0);
    return Buffer.concat([len, body, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from('\x89PNG\r\n\x1a\n', 'binary'),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- build the monochrome layer -------------------------------------------
const src = decodePng(fs.readFileSync(SRC));
const { width, height, channels, pixels } = src;
const BG_CUTOFF = 24; // luminance of the dark plate is ~12; the mark starts ~45
const GAIN = 3.4; // pushes the mark (lum ~88) close to full opacity
const out = Buffer.alloc(width * height * 4);
let opaque = 0;
for (let p = 0; p < width * height; p++) {
  const o = p * channels;
  const r = pixels[o];
  const g = pixels[o + 1];
  const b = pixels[o + 2];
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const a = Math.max(0, Math.min(255, Math.round((lum - BG_CUTOFF) * GAIN)));
  if (a > 20) opaque++;
  out[p * 4] = 255;
  out[p * 4 + 1] = 255;
  out[p * 4 + 2] = 255;
  out[p * 4 + 3] = a;
}
if (opaque === 0) throw new Error('no mark found in the foreground layer — refusing to write a blank icon');
fs.writeFileSync(OUT, encodePng(width, height, out));
console.log(
  `wrote ${path.relative(ROOT, OUT)} (${width}x${height}, ` +
    `${((opaque / (width * height)) * 100).toFixed(1)}% of pixels carry the mark)`,
);