// G5: web store for the appearance choice. localStorage is synchronous and
// available before the unlock gate, so the gate itself already renders in the
// chosen theme. Not sensitive (only 'system' | 'light' | 'dark').
import { parseThemeMode, type ThemeMode } from './themeMode';

const KEY = 'fourmytravels.theme_mode';

export function readThemeMode(): ThemeMode {
  try {
    return parseThemeMode(globalThis.localStorage?.getItem(KEY));
  } catch {
    return 'system';
  }
}

export function writeThemeMode(mode: ThemeMode): void {
  try {
    globalThis.localStorage?.setItem(KEY, mode);
  } catch {
    /* private mode / storage disabled: applies for this session only */
  }
}
