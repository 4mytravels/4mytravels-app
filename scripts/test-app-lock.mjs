#!/usr/bin/env node
// Regression test for the native app lock decisions (src/utils/appLock.ts).
// Gebruik:  node scripts/test-app-lock.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();
const tsc = join(root, 'node_modules', '.bin', 'tsc');
let failed = 0;
const assert = (c, m) => { if (c) console.log('PASS:', m); else { console.error('FAIL:', m); failed++; } };

const cache = mkdtempSync(join(tmpdir(), '4mt-lock-'));
try {
  execFileSync(tsc, ['--ignoreConfig', '--module', 'commonjs', '--target', 'es2020', '--moduleResolution', 'node',
    '--skipLibCheck', '--ignoreDeprecations', '6.0', '--outDir', cache, 'src/utils/appLock.ts'], { cwd: root, stdio: 'pipe' });
} catch (e) { console.error('compile failed:', e.stderr?.toString() ?? e.message); process.exit(1); }
const { APP_LOCK_KEY, RELOCK_AFTER_MS, parseLockFlag, shouldRelock, lockUnavailableReason } = require(join(cache, 'appLock.js'));

assert(APP_LOCK_KEY === 'native_app_lock', 'key is native_app_lock');
assert(RELOCK_AFTER_MS === 60000, 'relock threshold 60s');
assert(parseLockFlag('1') && parseLockFlag('true'), "'1'/'true' -> on");
assert(!parseLockFlag('0') && !parseLockFlag(null) && !parseLockFlag(undefined), 'default off');
assert(!shouldRelock(false, 0, 999999), 'disabled never relocks');
assert(!shouldRelock(true, null, 999999), 'no background -> no relock');
assert(!shouldRelock(true, 1000, 1000 + 59999), '59.9s away -> stays unlocked');
assert(shouldRelock(true, 1000, 1000 + 60000), '60s away -> relock');
assert(shouldRelock(true, 0, 5000, 5000), 'custom threshold');
assert(lockUnavailableReason({ hasHardware: true, isEnrolled: true, securityLevel: 2 }) === null, 'biometrics enrolled -> ok');
assert(lockUnavailableReason({ hasHardware: true, isEnrolled: false, securityLevel: 1 }) === null, 'PIN only -> ok (device fallback)');
assert(lockUnavailableReason({ hasHardware: false, isEnrolled: false, securityLevel: 1 }) === null, 'no sensor but PIN -> ok');
assert(typeof lockUnavailableReason({ hasHardware: true, isEnrolled: false, securityLevel: 0 }) === 'string', 'nothing enrolled -> reason');
assert(typeof lockUnavailableReason({ hasHardware: false, isEnrolled: false, securityLevel: 0 }) === 'string', 'no hardware, no lock -> reason');

rmSync(cache, { recursive: true, force: true });
if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log('all passed');
