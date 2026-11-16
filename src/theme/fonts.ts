// Font loader — loads the Lovable design fonts (Manrope + Sora) via expo-font.
// Font files live in ../assets/fonts (variable TTFs from Google Fonts).
import { Asset } from 'expo-asset';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';
import { Platform } from 'react-native';

const MANROPE = require('../assets/fonts/Manrope.ttf');
const SORA = require('../assets/fonts/Sora.ttf');

// Web: expo-font registers the variable TTFs with a single weight (400), so
// the browser fakes bold by smearing glyphs (cramped/blurry headings). Re-register
// them with the full weight range so the real wght axis is used.
function registerVariableWeights() {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || typeof FontFace === 'undefined') return;
  const defs: [string, number][] = [['Manrope', MANROPE], ['Sora', SORA]];
  for (const [family, mod] of defs) {
    const uri = Asset.fromModule(mod).uri;
    new FontFace(family, `url(${uri})`, { weight: '200 800', display: 'swap' })
      .load()
      .then((face) => document.fonts.add(face))
      .catch(() => {});
  }
}

export function useAppFonts() {
  const result = useFonts({
    Manrope: MANROPE,
    Sora: SORA,
  });
  const loaded = result[0];
  useEffect(() => {
    if (loaded) registerVariableWeights();
  }, [loaded]);
  return result;
}
