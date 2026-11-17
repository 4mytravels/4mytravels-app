#!/usr/bin/env node
// Create-backup -> save to file (src/services/backupSaveCore.ts).
// Covers: native save into a picked folder, cancel (Android + iOS codes),
// name collision, write error; web save dialog, cancel, expired activation ->
// download, no picker -> download. Asserts the written bytes equal the
// envelope (restore reads them unchanged; the envelope round-trip itself is
// covered by test-backup-roundtrip.mjs).
//
// Gebruik:  node scripts/test-backup-save.mjs

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

const cache = mkdtempSync(join(tmpdir(), '4mt-save-'));
try {
  try { symlinkSync(join(root, 'node_modules'), join(cache, 'node_modules'), 'dir'); } catch { /* best effort */ }
  execFileSync(tsc, [
    '--ignoreConfig', '--module', 'commonjs', '--target', 'es2020',
    '--moduleResolution', 'node', '--esModuleInterop', '--skipLibCheck',
    '--ignoreDeprecations', '6.0', '--outDir', cache,
    'src/services/backupSaveCore.ts',
  ], { cwd: root, stdio: 'pipe' });
} catch (e) {
  console.error('Kon backupSaveCore niet compileren:', e.stderr?.toString() ?? e.message);
  process.exit(1);
}
const m = require(join(cache, 'backupSaveCore.js'));
rmSync(cache, { recursive: true, force: true });

const NOW = new Date(2026, 10, 16, 21, 0);
const ENV = JSON.stringify({ app: '4mytravels', v: 2, enc: 'base64', data: 'QUJD' });
const NAME = '4mytravels-backup-2026-11-16.json';

assert(m.backupFileName(NOW) === NAME, 'bestandsnaam met app + datum');

function folder({ files = {}, pickErr = null, writeErr = null } = {}) {
  return {
    files,
    deps: {
      pickDirectory: async () => { if (pickErr) throw pickErr; return { label: 'Download' }; },
      listNames: () => Object.keys(files),
      writeFile: (n, mime, c) => { if (writeErr) throw writeErr; files[n] = { mime, c }; },
    },
  };
}
const cancelAndroid = Object.assign(new Error('The file picker was cancelled by the user'), { code: 'ERR_PICKER_CANCELLED' });
const cancelIos = Object.assign(new Error('File picking was cancelled by the user'), { code: 'ERR_FILE_PICKING_CANCELLED' });

{
  const f = folder();
  const r = await m.saveBackupNative(ENV, f.deps, NOW);
  assert(r.kind === 'saved' && r.name === NAME && r.location === 'Download'
    && f.files[NAME].c === ENV && f.files[NAME].mime === 'application/json',
    'native: opgeslagen in gekozen map, bytes identiek');
}
for (const [label, err] of [['android', cancelAndroid], ['ios', cancelIos]]) {
  const f = folder({ pickErr: err });
  const r = await m.saveBackupNative(ENV, f.deps, NOW);
  assert(r.kind === 'cancelled' && Object.keys(f.files).length === 0, `native cancel (${label}): stil, niets geschreven`);
}
{
  const f = folder({ files: { [NAME]: {}, '4mytravels-backup-2026-11-16 (2).json': {} } });
  const r = await m.saveBackupNative(ENV, f.deps, NOW);
  assert(r.name === '4mytravels-backup-2026-11-16 (3).json' && f.files[r.name].c === ENV, 'native: bestaande backup niet overschreven');
}
{
  const f = folder({ writeErr: new Error('disk full') });
  let threw = false;
  try { await m.saveBackupNative(ENV, f.deps, NOW); } catch { threw = true; }
  assert(threw, 'native: schrijffout wordt doorgegeven (foutmelding)');
}
{
  const f = folder({ pickErr: new Error('boom') });
  let threw = false;
  try { await m.saveBackupNative(ENV, f.deps, NOW); } catch { threw = true; }
  assert(threw, 'native: andere pickerfout is geen cancel');
}

function web({ picker = true, pickErr = null } = {}) {
  const log = { saved: null, downloaded: null };
  return {
    log,
    deps: {
      showSaveFilePicker: picker ? async (n, t) => {
        if (pickErr) { const e = new Error(pickErr); e.name = pickErr; throw e; }
        return { write: async (c) => { log.saved = { c, n, t }; } };
      } : undefined,
      download: (c, n, t) => { log.downloaded = { c, n, t }; },
    },
  };
}
{
  const w = web();
  const r = await m.saveBackupWeb(ENV, w.deps, NOW);
  assert(r.kind === 'saved' && w.log.saved?.c === ENV && w.log.saved.n === NAME && !w.log.downloaded, 'web: save-dialoog, geen download');
}
{
  const w = web({ pickErr: 'AbortError' });
  const r = await m.saveBackupWeb(ENV, w.deps, NOW);
  assert(r.kind === 'cancelled' && !w.log.downloaded, 'web cancel (AbortError): stil');
}
{
  const w = web({ pickErr: 'SecurityError' });
  const r = await m.saveBackupWeb(ENV, w.deps, NOW);
  assert(r.kind === 'downloaded' && w.log.downloaded?.c === ENV, 'web: activation verlopen -> download');
}
{
  const w = web({ picker: false });
  const r = await m.saveBackupWeb(ENV, w.deps, NOW);
  assert(r.kind === 'downloaded' && w.log.downloaded?.n === NAME, 'web: geen picker -> download');
}
{
  const w = web({ pickErr: 'DataError' });
  let threw = false;
  try { await m.saveBackupWeb(ENV, w.deps, NOW); } catch { threw = true; }
  assert(threw && !w.log.downloaded, 'web: onverwachte fout wordt doorgegeven');
}

if (failed) { console.error(`${failed} test(s) failed`); process.exit(1); }
console.log('all backup-save tests passed');
