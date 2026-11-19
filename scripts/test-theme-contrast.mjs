#!/usr/bin/env node
// G5 regression: light/dark palettes. Compiles src/theme/theme.ts + themeMode.ts
// and asserts (1) both palettes have the same keys, (2) WCAG contrast for the
// pairs the UI actually draws, in BOTH schemes, (3) the scheme switch, the
// themedStyles proxy and the mode parsing, (4) every screen file that uses
// colours wraps its module-scope StyleSheet in themedStyles.
// Gebruik:  node scripts/test-theme-contrast.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();
let failed = 0;
const assert = (c, m) => { if (c) console.log('PASS:', m); else { console.error('FAIL:', m); failed++; } };

// ---- WCAG 2.x relative luminance / contrast, with alpha composited over a base.
function parse(c) {
  let m = /^#([0-9a-f]{6})$/i.exec(c);
  if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]; }
  m = /^rgba?\(([^)]+)\)$/.exec(c);
  if (m) { const p = m[1].split(',').map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; }
  throw new Error('bad colour ' + c);
}
function over(fg, bg) {
  const [r, g, b, a] = parse(fg); const [R, G, B] = parse(bg);
  return [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)];
}
const lum = ([r, g, b]) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** contrast of `fg` drawn on `surface` (itself possibly translucent over `base`). */
function contrast(P, fg, surface, base = P.background) {
  const s = over(P[surface] ?? surface, P[base] ?? base);
  const f = over(P[fg] ?? fg, `rgb(${s.join(',')})`);
  return ratio(f, s);
}

const cache = mkdtempSync(join(tmpdir(), '4mt-theme-'));
try {
  execFileSync(join(root, 'node_modules', '.bin', 'tsc'), [
    '--ignoreConfig', '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--lib', 'es2021',
    '--ignoreDeprecations', '6.0', '--rootDir', 'src', '--outDir', cache, 'src/theme/theme.ts', 'src/theme/themeMode.ts',
  ], { cwd: root, stdio: 'pipe' });
  const T = require(join(cache, 'theme/theme.js'));
  const M = require(join(cache, 'theme/themeMode.js'));

  const dk = Object.keys(T.darkColors).sort(), lk = Object.keys(T.lightColors).sort();
  assert(JSON.stringify(dk) === JSON.stringify(lk), `light and dark palettes have the same ${dk.length} keys`);

  // Text pairs need 4.5:1 (AA normal text); UI graphics / large text 3:1.
  const TEXT = [
    ['foreground', 'background'], ['foreground', 'card'], ['foreground', 'secondary'],
    ['mutedForeground', 'background'], ['mutedForeground', 'card'], ['mutedForeground', 'secondary'],
    ['primaryText', 'background'], ['primaryText', 'card'], ['primaryText', 'primary12', 'card'],
    ['primaryForeground', 'primarySolid'], ['ctaForeground', 'cta'],
    ['foreground', 'primary12', 'card'], ['foreground', 'navSurface'], ['mutedForeground', 'navSurface'],
    ['success', 'card'], ['warning', 'card'], ['danger', 'card'], ['info', 'card'], ['teal', 'card'],
    ['success', 'success15', 'card'], ['warning', 'warning15', 'card'], ['danger', 'danger15', 'card'],
    ['destructive', 'card'], ['destructive', 'background'], ['red400', 'card'],
    ['foreground', 'amberNoticeSurface'], ['mutedForeground', 'amberNoticeSurface'],
    ['foreground', 'redNoticeSurface'], ['mutedForeground', 'redNoticeSurface'],
    ['foreground', 'primaryNoticeSurface'], ['mutedForeground', 'primaryNoticeSurface'],
    ['warning', 'amber10', 'card'],
  ];
  const GRAPHIC = [
    ['primary', 'card'], ['primary', 'background'], ['primarySolid', 'background'], ['routeLine', 'card'],
  ];
  for (const scheme of ['dark', 'light']) {
    const P = scheme === 'dark' ? T.darkColors : T.lightColors;
    for (const [fg, bg, base] of TEXT) {
      const r = contrast(P, fg, bg, base);
      assert(r >= 4.5, `${scheme}: ${fg} on ${bg}${base ? ` (over ${base})` : ''} = ${r.toFixed(2)}:1 ≥ 4.5`);
    }
    for (const [fg, bg] of GRAPHIC) {
      const r = contrast(P, fg, bg);
      assert(r >= 3, `${scheme}: ${fg} on ${bg} = ${r.toFixed(2)}:1 ≥ 3 (graphic)`);
    }
  }
  // Photo overlays and the donut must not change with the theme.
  for (const k of ['onImage', 'onImageMuted', 'onImageSurface', 'onImageSurfacePressed', 'onImageTrack', 'imageGradientTop', 'imageGradientBottom', 'primaryBar', 'mutedBar',
    'teal300', 'teal32', 'blue200', 'blue28', 'foreground72', 'foreground82', 'slate22', 'pastVeil', 'noPhoto1', 'noPhoto2', 'noPhoto3', 'foreground28', 'chart1', 'chart2', 'chart3', 'chart4', 'chart5']) {
    assert(T.lightColors[k] === T.darkColors[k], `${k} is theme-independent (on a photo / chart series)`);
  }
  assert(T.donutPalette[0] === '#6366F1' && T.donutPalette.length === 6, 'donut palette unchanged');

  // Scheme switch + proxy.
  assert(T.getActiveScheme() === 'dark' && T.colors.background === T.darkColors.background, 'default scheme is dark');
  let built = 0;
  const styles = T.themedStyles(() => { built++; return { box: { backgroundColor: T.colors.background } }; });
  assert(styles.box.backgroundColor === T.darkColors.background, 'themedStyles resolves against dark');
  T.setActiveScheme('light');
  assert(T.colors.background === T.lightColors.background, 'colors.x follows setActiveScheme');
  assert(styles.box.backgroundColor === T.lightColors.background, 'themedStyles resolves against light after switch');
  T.setActiveScheme('dark');
  void styles.box; void styles.box;
  assert(built === 2, `themedStyles factory runs once per scheme (ran ${built}x)`);
  assert(Object.keys(styles).join() === 'box' && 'box' in styles, 'proxy supports keys/in');

  // Mode parsing + resolution.
  assert(M.parseThemeMode(null) === 'system' && M.parseThemeMode('bogus') === 'system' && M.parseThemeMode('light') === 'light', 'parseThemeMode defaults to system');
  assert(M.resolveScheme('system', 'light') === 'light' && M.resolveScheme('system', 'dark') === 'dark', 'system follows OS');
  assert(M.resolveScheme('system', null) === 'dark', 'unknown OS scheme → dark');
  assert(M.resolveScheme('light', 'dark') === 'light' && M.resolveScheme('dark', 'light') === 'dark', 'explicit choice wins over OS');
  assert(JSON.stringify(M.THEME_MODES) === '["system","light","dark"]', 'Settings offers System / Light / Dark');
} finally {
  rmSync(cache, { recursive: true, force: true });
}

// Static: no module-scope StyleSheet that reads colours without themedStyles.
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = [...walk(join(root, 'app')), ...walk(join(root, 'src'))].filter((f) => /\.tsx?$/.test(f) && !f.includes('/theme/'));
const bad = files.filter((f) => {
  const s = readFileSync(f, 'utf8');
  return /colors\./.test(s) && /^(export )?const \w+[^=]*= StyleSheet\.create\(/m.test(s);
});
assert(bad.length === 0, `every module-scope StyleSheet using colors is themed${bad.length ? ': ' + bad.join(', ') : ''}`);
const tc = readFileSync(join(root, 'src/components/TripCard.tsx'), 'utf8');
assert(/const SCRIM = IMAGE_SCRIM/.test(tc), 'trip-card photo scrim does not follow the theme');
const appJson = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8'));
assert(appJson.expo.userInterfaceStyle === 'automatic', 'app.json userInterfaceStyle = automatic (Q12 reverted by G5)');

if (failed) { console.error(`\n${failed} failure(s)`); process.exit(1); }
console.log('\nAll theme assertions passed.');
