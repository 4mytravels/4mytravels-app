// Font files for web (M6): the same Latin subset as fontFiles.ts, as WOFF2
// (Manrope 31 KB + Sora 44 KB, was 277 KB of full TTFs). The variable `wght`
// axis is kept, so registerVariableWeights() in fonts.ts still works.
// Subset range: U+0000-00FF, U+0100-017F, U+0192, U+0218-021B, U+02BB-02BC,
// U+02C6, U+02DA, U+02DC, U+0300-0304, U+0308, U+0329, U+1E9E, U+2000-206F,
// U+2074, U+20A0-20CF, U+2113, U+2122, U+2190-2199, U+2212, U+2215, U+2248,
// U+2260, U+2264, U+2265, U+FEFF, U+FFFD. Glyphs outside it (e.g. Thai script
// in a note) fall back to the system font.
export const MANROPE = require('../assets/fonts/Manrope.woff2');
export const SORA = require('../assets/fonts/Sora.woff2');
