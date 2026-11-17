// G5: where the appearance choice is stored (native). It must be readable
// SYNCHRONOUSLY before the first frame, i.e. before the encrypted database is
// open, so it does not live in app_settings. expo-secure-store has a sync
// getItem. Not sensitive; stored there only because it is the sync store we ship.
import * as SecureStore from 'expo-secure-store';
import { parseThemeMode, type ThemeMode } from './themeMode';

const KEY = 'fourmytravels.theme_mode';

export function readThemeMode(): ThemeMode {
  try {
    return parseThemeMode(SecureStore.getItem(KEY));
  } catch {
    return 'system';
  }
}

export function writeThemeMode(mode: ThemeMode): void {
  try {
    SecureStore.setItem(KEY, mode);
  } catch {
    /* best effort: the choice still applies for this session */
  }
}
