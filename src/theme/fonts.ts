// Font loader — loads the Lovable design fonts (Manrope + Sora) via expo-font.
// Font files live in ../assets/fonts (variable TTFs from Google Fonts).
import { useFonts } from 'expo-font';

const MANROPE = require('../assets/fonts/Manrope.ttf');
const SORA = require('../assets/fonts/Sora.ttf');

export function useAppFonts() {
  return useFonts({
    Manrope: MANROPE,
    Sora: SORA,
  });
}
