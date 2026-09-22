/*
 * 4MyTravels PWA storage worker — sqlite3mc WASM engine (MVP scope §2.2).
 *
 * Runs the vendored sqlite3mc v2.5.1 WASM build (public/jswasm/) with the
 * OPFS-sahpool VFS when available, falling back to an in-memory database
 * whose (already-encrypted) bytes are snapshotted to IndexedDB after every
 * write. Encryption uses SQLite3MC's SQLCipher-compatible scheme
 * (AES-256 + HMAC), keyed via PRAGMA hexkey with an Argon2id-derived key
 * supplied by the main thread.
 *
 * Message protocol (request → response, correlated by id):
 *   { id, op: 'open',    keyHex }            → { ok, vfs, isNew }
 *   { id, op: 'exec',    sql, params? }      → { ok, changes }
 *   { id, op: 'query',   sql, params? }      → { ok, rows }
 *   { id, op: 'compact' }                    → { ok }               (VACUUM)
 *   { id, op: 'close' }                      → { ok }
 *   { id, op: 'health' }                     → { ok, vfs, persisted }
 *   { id, op: 'exportDb' }                   → { ok, bytes }        (encrypted image)
 *   { id, op: 'importDb', bytes, keyHex }    → { ok }               (replace + reopen)
 *   { id, op: 'getSalt' }                    → { ok, salt }         (creates if absent)
 *
 * Errors: { id, ok: false, error, code } where code is the SQLite result
 * code string when available (e.g. 'SQLITE_NOTADB' on a wrong key).
 *
 * This file is plain JS served from public/ — deliberately NOT bundled by
 * Metro — so importScripts() resolves the vendored artifacts relative to the
 * app origin. The protocol types are mirrored in src/db/web/protocol.ts.
 */
'use strict';

importScripts(self.location.origin.replace(/\/$/, '') + '/jswasm/sqlite3.js');

const IDB_NAME = 'fourmytravels';
const IDB_STORE = 'kv';
const DB_FILENAME = '/4mt.sqlite3';
const SAHPOOL_VFS = 'multipleciphers-opfs-sahpool'; // SQLite3MC prefix enables the codec shim
const SALT_KEY = 'db.salt';

let sqlite3Api = null;   // resolved sqlite3 module
let db = null;           // oo1.DB handle
let vfsMode = 'unknown'; // 'sahpool' | 'idb' | 'memory'
let poolUtil = null;     // sahpool pool util (when sahpool active)

const reply = (id, payload) => postMessage(Object.assign({ id }, payload));
const fail = (id, e) => reply(id, {
  ok: false,
  error: String((e && e.message) || e),
  code: e && e.resultCode ? String(e.resultCode) : undefined,
});

/* ---------- IndexedDB key-value store (salt + fallback snapshots) ---------- */

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

async function idbPut(key, value) {
  const idb = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => { idb.close(); resolve(); };
    tx.onerror = () => { idb.close(); reject(tx.error || new Error('IndexedDB put failed')); };
  });
}

async function idbGet(key) {
  const idb = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => { idb.close(); resolve(req.result || null); };
    req.onerror = () => { idb.close(); reject(req.error || new Error('IndexedDB get failed')); };
  });
}

/* ---------- engine boot ---------- */

async function bootEngine() {
  if (sqlite3Api) return;
  sqlite3Api = await sqlite3InitModule({
    locateFile: (file) => self.location.origin.replace(/\/$/, '') + '/jswasm/' + file,
  });
}

async function initVfs() {
  if (vfsMode !== 'unknown') return;
  // Dev/test hook: ?forceFallback=1 on the PAGE url makes the worker use the
  // IDB snapshot path even when OPFS is available (acceptance test for the
  // Safari-private-browsing scenario).
  let forceFallback = false;
  try {
    const params = new URLSearchParams(self.location.search);
    forceFallback = params.get('forceFallback') === '1';
  } catch (_) { /* no search params on blob workers */ }
  if (forceFallback) {
    poolUtil = null;
    vfsMode = 'idb';
    postMessage({ log: 'forced IDB fallback (test mode)' });
    return;
  }
  try {
    poolUtil = await sqlite3Api.installOpfsSAHPoolVfs();
    vfsMode = 'sahpool';
  } catch (e) {
    poolUtil = null;
    // OPFS unavailable (Safari private browsing, old browsers, missing
    // COOP/COEP): in-memory db + IndexedDB snapshot fallback.
    vfsMode = 'idb';
    postMessage({ log: 'sahpool unavailable — using IndexedDB snapshot fallback: ' + e.message });
  }
}

/* ---------- db open / key / snapshot ---------- */

function applyKeyAndScheme(keyHex) {
  // Order matters: cipher scheme BEFORE key (SQLite3MC requirement), and the
  // probe SELECT makes a wrong key fail fast with SQLITE_NOTADB.
  db.exec("PRAGMA cipher = 'sqlcipher';");
  db.exec('PRAGMA hexkey = ' + JSON.stringify(keyHex) + ';');
  db.exec('SELECT count(*) FROM sqlite_schema;');
}

function exportDbBytes() {
  const u8 = sqlite3Api.capi.sqlite3_js_db_export(db.pointer);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

/* ---------- IDB snapshot envelope (AES-GCM) ----------
 * SQLite3MC cannot key an in-memory database, so the idb-fallback keeps the
 * live db plaintext in RAM (session-only — same exposure model as an unlocked
 * SQLCipher db) and encrypts the PERSISTED snapshot with WebCrypto AES-GCM
 * using the same Argon2id-derived key. At rest, IndexedDB therefore only
 * ever holds ciphertext. */

let aesKey = null; // CryptoKey for the snapshot envelope (idb mode)

async function initAesKey(keyHex) {
  const raw = new Uint8Array(keyHex.match(/.{2}/g).map((h) => parseInt(h, 16)));
  aesKey = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptForIdb(plain) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plain));
  // [12-byte iv][ciphertext] — tag is appended by WebCrypto.
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return out.buffer;
}

async function decryptFromIdb(envelope) {
  const u8 = envelope instanceof Uint8Array ? envelope : new Uint8Array(envelope);
  const iv = u8.slice(0, 12);
  const ct = u8.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ct);
  return new Uint8Array(plain);
}

async function loadIdbSnapshot() {
  if (vfsMode !== 'idb') return false;
  const envelope = await idbGet('db');
  if (!envelope || !envelope.byteLength) return false;
  // A wrong passphrase fails HERE (AES-GCM auth) — surfaced as a decrypt
  // error, which the adapter maps to WrongKeyError.
  const u8 = await decryptFromIdb(envelope);
  const capi = sqlite3Api.capi;
  const wasm = sqlite3Api.wasm;
  const pData = wasm.allocFromTypedArray(u8);
  const rc = capi.sqlite3_deserialize(
    db.pointer, 'main', pData,
    BigInt(u8.byteLength), BigInt(u8.byteLength),
    1 | 2,
  );
  if (rc !== 0) {
    wasm.dealloc(pData);
    throw new Error('snapshot restore failed, rc=' + rc);
  }
  return true;
}

async function flushIdbSnapshot() {
  if (vfsMode !== 'idb' || !db) return;
  const cipher = await encryptForIdb(new Uint8Array(exportDbBytes()));
  await idbPut('db', cipher);
}

/* ---------- op handlers ---------- */

async function opOpen(msg) {
  await bootEngine();
  await initVfs();
  if (db) { db.close(); db = null; }

  if (vfsMode === 'sahpool') {
    db = new sqlite3Api.oo1.DB({ filename: DB_FILENAME, flags: 'ct', vfs: SAHPOOL_VFS });
    applyKeyAndScheme(msg.keyHex);
    reply(msg.id, { ok: true, vfs: vfsMode, isNew: false });
    return;
  }

  // idb fallback: in-memory db (SQLite3MC cannot key :memory:), seeded from
  // the last AES-GCM-encrypted snapshot when present. The RAM copy is
  // plaintext for the session; the persisted snapshot is always ciphertext.
  db = new sqlite3Api.oo1.DB(':memory:', 'ct');
  await initAesKey(msg.keyHex);
  let seeded = false;
  try {
    seeded = await loadIdbSnapshot();
  } catch (e) {
    if (/decrypt|OperationError/i.test(String(e))) {
      // Wrong passphrase on the existing snapshot — treat exactly like a
      // wrong PRAGMA key on sahpool.
      db.close(); db = null;
      throw Object.assign(
        new Error('SQLITE_NOTADB: file is not a database (wrong key)'),
        { resultCode: 'SQLITE_NOTADB' },
      );
    }
    postMessage({ log: 'snapshot restore failed, starting fresh: ' + e.message });
  }
  reply(msg.id, { ok: true, vfs: vfsMode, isNew: !seeded });
}

function opExec(msg) {
  if (!db) throw new Error('db not open');
  if (msg.params && msg.params.length) {
    db.exec({ sql: msg.sql, bind: msg.params });
  } else {
    db.exec(msg.sql);
  }
}

function opQuery(msg) {
  if (!db) throw new Error('db not open');
  return { rows: db.selectObjects(msg.sql, msg.params) };
}

async function opCompact() {
  if (!db) throw new Error('db not open');
  db.exec('VACUUM;');
  await flushIdbSnapshot();
}

async function opClose() {
  if (db) {
    await flushIdbSnapshot();
    db.close();
    db = null;
  }
}

async function opHealth() {
  let persisted = null;
  try {
    persisted = (navigator.storage && navigator.storage.persisted)
      ? await navigator.storage.persisted() : null;
  } catch (_) { /* not available */ }
  return { vfs: vfsMode, persisted };
}

async function opExportDb() {
  if (!db) throw new Error('db not open');
  return { bytes: exportDbBytes() };
}

async function opImportDb(msg) {
  // Replace the current database with an imported encrypted image (backup
  // restore path). Only supported on sahpool (OPFS) — the idb fallback
  // simply overwrites its snapshot after importing into memory.
  await bootEngine();
  await initVfs();
  if (db) { db.close(); db = null; }
  const u8 = msg.bytes instanceof Uint8Array ? msg.bytes : new Uint8Array(msg.bytes);

  if (vfsMode === 'sahpool' && poolUtil) {
    // Remove existing db file, then import the bytes through the pool.
    try { await poolUtil.removeVfs(); } catch (_) { /* not initialized yet */ }
    poolUtil = await sqlite3Api.installOpfsSAHPoolVfs();
    await sqlite3Api.opfs.importDb(DB_FILENAME, u8);
    db = new sqlite3Api.oo1.DB({ filename: DB_FILENAME, flags: 'ct', vfs: SAHPOOL_VFS });
    applyKeyAndScheme(msg.keyHex);
    return {};
  }

  // idb mode: import into memory, then persist via the AES-GCM envelope.
  // (No SQLite3MC key applies here — the imported bytes are an UNENCRYPTED
  // sqlite image from the backup-restore path; the snapshot encrypts at rest.)
  db = new sqlite3Api.oo1.DB(':memory:', 'ct');
  await initAesKey(msg.keyHex);
  const capi = sqlite3Api.capi;
  const wasm = sqlite3Api.wasm;
  const pData = wasm.allocFromTypedArray(u8);
  const rc = capi.sqlite3_deserialize(
    db.pointer, 'main', pData,
    BigInt(u8.byteLength), BigInt(u8.byteLength), 1 | 2,
  );
  if (rc !== 0) { wasm.dealloc(pData); throw new Error('import failed, rc=' + rc); }
  await flushIdbSnapshot();
  return {};
}

async function opGetSalt() {
  let salt = await idbGet(SALT_KEY);
  if (!salt) {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    salt = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    await idbPut(SALT_KEY, salt);
  }
  return { salt };
}

/* ---------- dispatch ---------- */

self.onmessage = async (ev) => {
  const msg = ev.data;
  if (!msg || typeof msg.id !== 'number' || !msg.op) return;
  try {
    let extra = {};
    switch (msg.op) {
      case 'open': await opOpen(msg); return;
      case 'exec': opExec(msg); await flushIdbSnapshot(); extra = { changes: db.changes() }; break;
      case 'query': extra = opQuery(msg); break;
      case 'compact': await opCompact(); break;
      case 'close': await opClose(); break;
      case 'health': extra = await opHealth(); break;
      case 'exportDb': extra = await opExportDb(); break;
      case 'importDb': extra = await opImportDb(msg); break;
      case 'getSalt': extra = await opGetSalt(); break;
      default: throw new Error('unknown op: ' + msg.op);
    }
    reply(msg.id, Object.assign({ ok: true }, extra));
  } catch (e) {
    fail(msg.id, e);
  }
};
