#!/usr/bin/env node
// Regression test for src/utils/splash.ts (boot splash phases) + the app.json
// expo-splash-screen config (brand background, sensible logo size, no legacy
// android.splash that would be ignored).
//
// Gebruik:  node scripts/test-splash.mjs

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();
let failed = 0;
const assert = (c, m) => { if (c) console.log('PASS:', m); else { console.error('FAIL:', m); failed++; } };

const cache = mkdtempSync(join(tmpdir(), '4mt-splash-'));
try {
  execFileSync(join(root, 'node_modules', '.bin', 'tsc'), [
    '--ignoreConfig', '--module', 'commonjs', '--target', 'es2020', '--moduleResolution', 'node',
    '--skipLibCheck', '--ignoreDeprecations', '6.0', '--outDir', cache, 'src/utils/splash.ts',
  ], { cwd: root, stdio: 'pipe' });
} catch (e) {
  console.error('Kon splash niet compileren:', e.stdout?.toString() ?? e.message);
  process.exit(1);
}
try {
  const m = require(join(cache, 'splash.js'));
  const n = m.nextSplashPhase;
  assert(n('native', 'overlayShown') === 'native', 'native ignores overlayShown');
  assert(n('native', 'fadeEnd') === 'native', 'native ignores fadeEnd');
  assert(n('native', 'booted') === 'overlay', 'native + booted → overlay');
  assert(n('overlay', 'booted') === 'overlay', 'repeated booted is idempotent');
  assert(n('overlay', 'overlayShown') === 'fading', 'overlay painted → fading');
  assert(n('fading', 'fadeEnd') === 'done', 'fade end → done');
  assert(n('done', 'booted') === 'done', 'done is terminal (no splash on re-boot)');
  assert(m.isBooted(true, true, null) === true, 'ready + fonts → booted');
  assert(m.isBooted(true, false, null) === false, 'fonts not loaded → not booted');
  assert(m.isBooted(false, true, null) === false, 'storage not ready → not booted');
  assert(m.isBooted(false, false, 'boom') === true, 'init error → booted (error screen must show)');
  assert(m.isBooted(false, true, 'wrong-key') === false, 'web wrong-key retry is not booted');
  assert(m.SPLASH_FADE_MS >= 300 && m.SPLASH_FADE_MS <= 500, 'fade ~400ms');
  assert(m.SPLASH_BG === '#0A0A1A', 'overlay bg = brand bg');

  const app = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')).expo;
  const entry = app.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-splash-screen');
  assert(!!entry, 'expo-splash-screen plugin configured');
  const cfg = entry?.[1] ?? {};
  assert(cfg.backgroundColor === m.SPLASH_BG, 'native bg matches overlay bg');
  assert(cfg.dark?.backgroundColor === m.SPLASH_BG, 'dark variant bg = brand bg');
  assert(cfg.imageWidth >= 160 && cfg.imageWidth <= 200 && cfg.imageWidth === m.SPLASH_LOGO_SIZE, 'logo width 160–200 and = overlay logo');
  assert(cfg.image && existsSync(join(root, cfg.image)), 'splash image exists');
  assert(!app.android?.splash && !app.splash, 'no legacy splash keys');
  const manifest = JSON.parse(readFileSync(join(root, 'public/manifest.webmanifest'), 'utf8'));
  assert(manifest.background_color.toUpperCase() === m.SPLASH_BG && manifest.theme_color.toUpperCase() === m.SPLASH_BG, 'PWA manifest brand colours');
} finally {
  rmSync(cache, { recursive: true, force: true });
}
if (failed) { console.error(`${failed} FAILED`); process.exit(1); }
console.log('ALL PASS');
