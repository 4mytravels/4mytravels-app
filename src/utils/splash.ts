// Boot splash phases (pure — unit-tested in scripts/test-splash.mjs).
//
// native   : the OS splash (expo-splash-screen) is still on screen
// overlay  : app booted; the JS overlay (same background + logo) is shown and
//            the native splash has been hidden underneath it
// fading   : the overlay fades/scales out
// done     : overlay unmounted
export type SplashPhase = 'native' | 'overlay' | 'fading' | 'done';
export type SplashEvent = 'booted' | 'overlayShown' | 'fadeEnd';

export const SPLASH_BG = '#0A0A1A';
export const SPLASH_FADE_MS = 400;
export const SPLASH_LOGO_SIZE = 200;

export function nextSplashPhase(phase: SplashPhase, event: SplashEvent): SplashPhase {
  switch (phase) {
    case 'native':
      return event === 'booted' ? 'overlay' : phase;
    case 'overlay':
      return event === 'overlayShown' ? 'fading' : phase;
    case 'fading':
      return event === 'fadeEnd' ? 'done' : phase;
    default:
      return phase;
  }
}

/** The app is "booted" once storage is ready and fonts loaded, OR init failed
 * (the error screen must never stay hidden behind the native splash). */
export function isBooted(ready: boolean, fontsLoaded: boolean, error: string | null): boolean {
  return (ready && fontsLoaded) || (error != null && error !== 'wrong-key');
}
