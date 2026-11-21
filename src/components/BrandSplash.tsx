// Native boot transition: keeps the OS splash until storage + fonts are ready,
// then shows an identical JS overlay (brand background + logo), hides the OS
// splash under it and fades/scales the overlay out (~400 ms, native driver).
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import {
  SPLASH_BG,
  SPLASH_FADE_MS,
  SPLASH_LOGO_SIZE,
  nextSplashPhase,
  type SplashPhase,
} from '../utils/splash';

// Module scope: must run before the first render, or the OS splash auto-hides
// and the user sees the loader/white window in between.
// Guarded: an APK built without the native module must still boot.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SplashScreen: typeof import('expo-splash-screen') | null =
  requireOptionalNativeModule('ExpoSplashScreen') != null ? require('expo-splash-screen') : null;
void SplashScreen?.preventAutoHideAsync().catch(() => {});

export function BrandSplash({ booted }: { booted: boolean }) {
  const [phase, setPhase] = useState<SplashPhase>('native');
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (booted) setPhase((p) => nextSplashPhase(p, 'booted'));
  }, [booted]);

  useEffect(() => {
    if (phase !== 'fading') return;
    Animated.timing(anim, {
      toValue: 1,
      duration: SPLASH_FADE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setPhase((p) => nextSplashPhase(p, 'fadeEnd')));
  }, [phase, anim]);

  if (phase === 'native' || phase === 'done') return null;

  return (
    <Animated.View
      pointerEvents="none"
      onLayout={() => {
        // Overlay is painted: drop the OS splash beneath it, then fade.
        SplashScreen?.hide();
        setPhase((p) => nextSplashPhase(p, 'overlayShown'));
      }}
      style={[
        StyleSheet.absoluteFill,
        styles.root,
        { opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
      ]}
    >
      <Animated.Image
        source={require('../../assets/icon.png')}
        resizeMode="contain"
        style={{
          width: SPLASH_LOGO_SIZE,
          height: SPLASH_LOGO_SIZE,
          transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) }],
        }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: SPLASH_BG, alignItems: 'center', justifyContent: 'center', zIndex: 100000, elevation: 100 },
});
