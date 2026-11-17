// G5: light/dark switching.
//
// Every screen reads colours through `colors.x` getters and `themedStyles`
// proxies (theme.ts), which resolve against the ACTIVE scheme at render time.
// Switching therefore = setActiveScheme() + re-render the whole UI. Memoised
// components would skip that re-render, so the UI subtree is REMOUNTED with a
// new key (<ThemedTree>). The remount resets navigation on native, so the
// current route is re-opened afterwards. A theme change is rare (Settings or
// an OS switch), so a remount is an acceptable cost for zero per-component work.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Appearance, Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router, usePathname } from 'expo-router';
import { colors, getActiveScheme, setActiveScheme, type ColorScheme } from './theme';
import { resolveScheme, type ThemeMode } from './themeMode';
import { readThemeMode, writeThemeMode } from './themePref';

type ThemeCtx = { mode: ThemeMode; scheme: ColorScheme; setMode: (m: ThemeMode) => void };
const Ctx = createContext<ThemeCtx>({ mode: 'system', scheme: 'dark', setMode: () => {} });

export function useThemeMode(): ThemeCtx {
  return useContext(Ctx);
}

function applyWebDocument(scheme: ColorScheme): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  document.documentElement.style.colorScheme = scheme;
  document.body.style.backgroundColor = colors.background;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors.background);
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', scheme);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => readThemeMode());
  const [system, setSystem] = useState(() => Appearance.getColorScheme());
  const scheme = resolveScheme(mode, system);
  // Set the palette DURING render, before any child reads `colors.x`.
  if (getActiveScheme() !== scheme) setActiveScheme(scheme);

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => setSystem(colorScheme));
    return () => sub.remove();
  }, []);
  useEffect(() => applyWebDocument(scheme), [scheme]);

  const setMode = useCallback((m: ThemeMode) => {
    writeThemeMode(m);
    setModeState(m);
  }, []);
  const value = useMemo(() => ({ mode, scheme, setMode }), [mode, scheme, setMode]);

  return (
    <Ctx.Provider value={value}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {children}
    </Ctx.Provider>
  );
}

/** Remounts its subtree when the scheme changes and re-opens the current route. */
export function ThemedTree({ children }: { children: ReactNode }) {
  const { scheme } = useThemeMode();
  const pathname = usePathname();
  const lastPath = useRef(pathname);
  const firstRun = useRef(true);
  // Runs after the remount, before the path effect below records the
  // (possibly reset) new path, so lastPath is still the route the user was on.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const target = lastPath.current;
    // Web keeps the URL across the remount; native starts at the initial route.
    if (Platform.OS === 'web' || !target || target === '/') return;
    const t = setTimeout(() => router.navigate(target as never), 0);
    return () => clearTimeout(t);
  }, [scheme]);
  useEffect(() => {
    lastPath.current = pathname;
  }, [pathname]);
  return (
    <View key={scheme} style={{ flex: 1, backgroundColor: colors.background }}>
      {children}
    </View>
  );
}
