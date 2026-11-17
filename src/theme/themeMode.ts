// G5: the user's appearance choice (Settings → Preferences → Appearance).
// Pure: no React, no storage, so scripts/test-theme-contrast.mjs can compile it.
import type { ColorScheme } from './theme';

export type ThemeMode = 'system' | 'light' | 'dark';
export const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark'];
export const THEME_MODE_LABEL: Record<ThemeMode, string> = { system: 'System', light: 'Light', dark: 'Dark' };

/** Anything unknown (missing pref, corrupt value) reads as 'system'. */
export function parseThemeMode(raw: string | null | undefined): ThemeMode {
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
}

/**
 * The scheme to render. 'system' follows the OS; an unknown OS value (null,
 * 'unspecified') falls back to dark, the app's original look.
 */
export function resolveScheme(mode: ThemeMode, system: string | null | undefined): ColorScheme {
  if (mode === 'light' || mode === 'dark') return mode;
  return system === 'light' ? 'light' : 'dark';
}
