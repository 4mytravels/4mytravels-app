// Web/PWA "add to your home screen" nudge (user request).
//
// Shown EVERY time the app opens in a browser tab, because the point is to
// convert a visitor into an installed app: an installed PWA gets its own icon,
// starts without browser chrome and keeps its encrypted storage out of the
// "clear browsing data" path.
//
// Two dismiss levels:
//   ✕  = this session only (nothing persisted),
//   "Never show again" = a flag in localStorage, so it never returns until the
//   user clears the site data or installs the app. No personal data is stored —
//   one boolean, and localStorage is already used for the passphrase flag.
//
// Three states:
//   prompt  — Chrome/Edge/Android fired beforeinstallprompt: one-tap Install.
//   ios     — Safari/iOS never fires it: show the Share ▸ Add to Home Screen path.
//   manual  — anything else (Firefox, dismissed prompt): show the browser-menu path.
// Hidden entirely when the app is already running installed (standalone /
// minimal-ui display mode) or right after an appinstalled event.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing, cardShadow } from '../theme/theme';

type BipEvent = Event & { prompt: () => Promise<void>; userChoice?: Promise<unknown> };
type Mode = 'hidden' | 'prompt' | 'ios' | 'manual';

/** localStorage flag for the permanent "never show again" dismiss. */
const NEVER_KEY = 'fourmytravels.install_notice_never';

// Several tabs render this banner at the same time (the tab navigator keeps the
// visited screens mounted), so each would own a private `dismissed` flag and the
// user had to close the notice once per tab. Keep the UI state at MODULE scope
// with a subscription instead: closing it anywhere hides it everywhere.
let dismissedState = false;
let neverState: boolean | null = null;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function emit() {
  for (const cb of listeners) cb();
}

function readNever(): boolean {
  try {
    return window.localStorage?.getItem(NEVER_KEY) === '1';
  } catch {
    return false;
  }
}

function forms(): { standalone: boolean; ios: boolean } {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return { standalone: false, ios: false };
  }
  const w = window as unknown as {
    matchMedia?: (q: string) => { matches: boolean };
    navigator?: { standalone?: boolean; userAgent?: string };
  };
  let standalone = w.navigator?.standalone === true;
  if (w.matchMedia) {
    for (const mode of ['standalone', 'minimal-ui', 'fullscreen']) {
      try {
        if (w.matchMedia(`(display-mode: ${mode})`).matches) standalone = true;
      } catch {
        /* older browsers */
      }
    }
  }
  const ua = w.navigator?.userAgent ?? '';
  return { standalone, ios: /iPad|iPhone|iPod/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua) };
}

export function PwaInstallBanner() {
  const [mode, setMode] = useState<Mode>('hidden');
  // In-flight explanation for the manual/ios path (see the footnote below).
  const [howto, setHowto] = useState(false);
  // Is Chrome currently holding a deferred install prompt we may call?
  const [bipOk, setBipOk] = useState(false);

  // Shared across every mounted copy of the banner. getServerSnapshot keeps the
  // prerendered HTML (no notice) identical to the first client render.
  const dismissed = useSyncExternalStore(
    subscribe,
    () => dismissedState,
    () => false,
  );
  const never = useSyncExternalStore(
    subscribe,
    () => {
      if (neverState === null) neverState = readNever();
      return neverState;
    },
    () => false,
  );

  const neverShowAgain = () => {
    try {
      window.localStorage?.setItem(NEVER_KEY, '1');
    } catch {
      /* storage blocked — hide it for this session anyway */
    }
    neverState = true;
    emit();
  };

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const { standalone, ios } = forms();
    if (standalone) return;

    // beforeinstallprompt fires early (before React mounts). Stash it globally
    // so a late-mounting banner still finds it.
    const w = window as unknown as { __fourmytravels_bip?: BipEvent | null };
    const applyBip = () => {
      setBipOk(!!w.__fourmytravels_bip);
      setMode(w.__fourmytravels_bip ? 'prompt' : ios ? 'ios' : 'manual');
    };
    const onBip = (e: Event) => {
      e.preventDefault();
      w.__fourmytravels_bip = e as BipEvent;
      applyBip();
    };
    const onInstalled = () => {
      setBipOk(false);
      setMode('hidden');
    };
    const onModeChange = () => {
      if (forms().standalone) setMode('hidden');
    };

    window.addEventListener('beforeinstallprompt', onBip);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('visibilitychange', onModeChange);
    applyBip();

    return () => {
      window.removeEventListener('beforeinstallprompt', onBip);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('visibilitychange', onModeChange);
    };
  }, []);

  const install = async () => {
    const w = window as unknown as { __fourmytravels_bip?: BipEvent | null };
    const bip = w.__fourmytravels_bip;
    if (!bip) {
      setBipOk(false);
      setMode(forms().ios ? 'ios' : 'manual');
      setHowto(true);
      return;
    }
    try {
      await bip.prompt();
    } catch {
      /* the user dismissed the native sheet — keep the banner up */
    }
    w.__fourmytravels_bip = null;
    setBipOk(false);
    setMode(forms().ios ? 'ios' : 'manual');
  };

  if (dismissed || never || mode === 'hidden') return null;

  // A one-tap install is only possible while Chrome holds a deferred
  // `beforeinstallprompt`. Chrome withholds it once the app is already
  // installed, or after its own prompt was used/dismissed — so the button must
  // never simply disappear (user report: "de knop Install app is weg"). When
  // there is nothing to call, the same button explains the browser path.
  const canOneTap = mode === 'prompt' && bipOk;
  const steps =
    mode === 'ios'
      ? 'Tap Share, then “Add to Home Screen”.'
      : 'Open the browser menu (⋮), then “Install app” / “Add to Home screen”.';
  const showSteps = mode === 'ios' || howto;

  return (
    <View style={styles.wrap}>
      <Ionicons name="phone-portrait-outline" size={20} color={colors.primary} style={styles.icon} />
      <View style={styles.body}>
        <Text style={styles.label}>Add 4MyTravels to your home screen</Text>
        <Text style={styles.detail}>
          Own icon, full-screen, and your data stays out of the browser cache.
        </Text>
        {showSteps && <Text style={styles.steps}>{steps}</Text>}
        <View style={styles.actions}>
          <Pressable
            onPress={canOneTap ? install : () => setHowto((v) => !v)}
            style={styles.cta}
          >
            <Text style={styles.ctaText}>{canOneTap ? 'Install app' : 'How to install'}</Text>
          </Pressable>
          <Pressable onPress={neverShowAgain} hitSlop={8}>
            <Text style={styles.never}>Never show again</Text>
          </Pressable>
        </View>
      </View>
      <Pressable onPress={() => { dismissedState = true; emit(); }} hitSlop={10}>
        <Text style={styles.close}>✕</Text>
      </Pressable>
    </View>
  );
}

// Registered at MODULE scope, not on mount: Chrome fires
// `beforeinstallprompt` early (right after the service worker registers), which
// can be before this component mounts — a mount-only listener would miss it and
// the one-tap Install button would never appear.
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    (window as unknown as { __fourmytravels_bip?: BipEvent }).__fourmytravels_bip = e as BipEvent;
  });
}

const styles = StyleSheet.create({
  // Sits in the layout flow directly below the screen's "4 My Travels" header
  // (user request: top of the screen, not floating above the nav).
  // OPAQUE surface: the old translucent primary tint over the dark background
  // made the notice hard to read (user request).
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: spacing.md,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    backgroundColor: '#1A1B41', // solid: #6366F1 @18% over the #0A0A1A background
    borderColor: colors.primaryBorder,
    ...cardShadow,
  },
  icon: { marginTop: 1 },
  body: { flex: 1, gap: 4 },
  label: { color: colors.foreground, fontSize: 13, fontWeight: '700', fontFamily: fontFamily.heading },
  detail: { color: colors.mutedForeground, fontSize: 12, lineHeight: 17, fontFamily: fontFamily.sans },
  steps: {
    color: colors.foreground,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
    fontFamily: fontFamily.sans,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.sm },
  never: {
    color: colors.mutedForeground,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: fontFamily.sans,
    textDecorationLine: 'underline',
  },
  cta: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  ctaText: { color: colors.primaryForeground, fontSize: 12, fontWeight: '700', fontFamily: fontFamily.sans },
  close: { color: colors.mutedForeground, fontSize: 14 },
});