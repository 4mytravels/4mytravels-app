#!/usr/bin/env node
// Create-backup → share sheet (src/services/backupShareCore.ts).
// Covers: native share, native cancel/dismiss, share error, stale-copy sweep,
// web share, web cancel (AbortError), web fallback download (no file share /
// expired user activation). Asserts no temp file survives any path and that
// the shared bytes are identical to the envelope (so restore-backup works —
// the envelope round-trip itself is covered by test-backup-roundtrip.mjs).
//
// Gebruik:  node scripts/test-backup-share.mjs

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();
const tsc = join(root, 'node_modules', '.bin', 'tsc');

let failed = 0;
function assert(cond, msg) {
  if (cond) console.log('PASS:', msg);
  else { console.error('FAIL:', msg); failed++; }
}

const cache = mkdtempSync(join(tmpdir(), '4mt-share-'));
try {
  try { symlinkSync(join(root, 'node_modules'), join(cache, 'node_modules'), 'dir'); } catch { /* best effort */ }
  execFileSync(tsc, [
    '--ignoreConfig', '--module', 'commonjs', '--target', 'es2020',
    '--moduleResolution', 'node', '--esModuleInterop', '--skipLibCheck',
    '--ignoreDeprecations', '6.0', '--outDir', cache,
    'src/services/backupShareCore.ts',
  ], { cwd: root, stdio: 'pipe' });
} catch (e) {
  console.error('Kon backupShareCore niet compileren:', e.stderr?.toString() ?? e.message);
  process.exit(1);
}
const m = require(join(cache, 'backupShareCore.js'));
rmSync(cache, { recursive: true, force: true });

const NOW = new Date(2026, 10, 16, 21, 0);
const ENV = JSON.stringify({ app: '4mytravels', v: 2, enc: 'base64', data: 'QUJD' });

assert(m.backupFileName(NOW) === '4mytravels-backup-2026-11-16.json', 'bestandsnaam met app + datum');

function fakeFs(initial = {}) {
  const files = { ...initial };
  const shared = [];
  return {
    files, shared,
    deps: (shareImpl = async () => {}, available = true) => ({
      isAvailable: async () => available,
      listCache: () => Object.keys(files),
      writeTemp: (n, c) => { files[n] = c; return `file:///cache/${n}`; },
      deleteTemp: (n) => { delete files[n]; },
      share: async (uri, opts) => { shared.push({ uri, opts, content: files[uri.split('/').pop()] }); await shareImpl(); },
    }),
  };
}

// native: shared
{
  const fs = fakeFs({ 'other.csv': 'x', '4mytravels-backup-2026-01-01.json': 'stale' });
  const r = await m.shareBackupNative(ENV, fs.deps(), NOW);
  assert(r === 'shared', 'native: share sheet geopend');
  assert(fs.shared[0]?.opts.mimeType === 'application/json', 'native: MIME application/json');
  assert(fs.shared[0]?.content === ENV, 'native: gedeelde bytes == envelope (restore-baar)');
  assert(!Object.keys(fs.files).some(m.isBackupTempName), 'native: geen backup-bestand meer in cache (incl. oude kopie)');
  assert('other.csv' in fs.files, 'native: andere cache-bestanden onaangetast');
}
// native: cancelled (expo-sharing resolves on dismiss)
{
  const fs = fakeFs();
  const r = await m.shareBackupNative(ENV, fs.deps(async () => {}), NOW);
  assert(r === 'shared' && Object.keys(fs.files).length === 0, 'native cancel: geen fout, geen restbestand');
}
// native: share throws
{
  const fs = fakeFs();
  let threw = false;
  try { await m.shareBackupNative(ENV, fs.deps(async () => { throw new Error('boom'); }), NOW); } catch { threw = true; }
  assert(threw && Object.keys(fs.files).length === 0, 'native fout: fout doorgegeven, temp-bestand toch verwijderd');
}
// native: sharing unavailable
{
  const fs = fakeFs();
  let threw = false;
  try { await m.shareBackupNative(ENV, fs.deps(undefined, false), NOW); } catch { threw = true; }
  assert(threw && Object.keys(fs.files).length === 0, 'native zonder share: nette fout, niets geschreven');
}

function web({ canShare = true, shareErr = null, hasShare = true } = {}) {
  const log = { shared: null, downloaded: null };
  return {
    log,
    deps: {
      makeFile: (c, n, t) => ({ c, n, t }),
      canShare: hasShare ? () => canShare : undefined,
      share: hasShare ? async (d) => { if (shareErr) { const e = new Error(shareErr); e.name = shareErr; throw e; } log.shared = d; } : undefined,
      download: (c, n, t) => { log.downloaded = { c, n, t }; },
    },
  };
}
{
  const w = web();
  const r = await m.shareBackupWeb(ENV, w.deps, NOW);
  const f = w.log.shared?.files[0];
  assert(r === 'shared' && f.c === ENV && f.n === '4mytravels-backup-2026-11-16.json' && f.t === 'application/json' && !w.log.downloaded,
    'web: Web Share met bestand, geen download');
}
{
  const w = web({ shareErr: 'AbortError' });
  const r = await m.shareBackupWeb(ENV, w.deps, NOW);
  assert(r === 'cancelled' && !w.log.downloaded, 'web cancel (AbortError): stil, geen download');
}
{
  const w = web({ shareErr: 'NotAllowedError' });
  const r = await m.shareBackupWeb(ENV, w.deps, NOW);
  assert(r === 'downloaded' && w.log.downloaded?.c === ENV, 'web: user-activation verlopen -> download-fallback');
}
{
  const w = web({ canShare: false });
  const r = await m.shareBackupWeb(ENV, w.deps, NOW);
  assert(r === 'downloaded' && w.log.downloaded?.n === '4mytravels-backup-2026-11-16.json', 'web: canShare(files)=false -> download-fallback');
}
{
  const w = web({ hasShare: false });
  const r = await m.shareBackupWeb(ENV, w.deps, NOW);
  assert(r === 'downloaded', 'web: geen navigator.share (desktop Firefox) -> download-fallback');
}
{
  const w = web({ shareErr: 'DataError' });
  let threw = false;
  try { await m.shareBackupWeb(ENV, w.deps, NOW); } catch { threw = true; }
  assert(threw && !w.log.downloaded, 'web: onverwachte fout wordt doorgegeven');
}

if (failed) { console.error(`${failed} test(s) failed`); process.exit(1); }
console.log('All backup-share tests passed');
