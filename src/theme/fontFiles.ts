// Font files for native (M6): Latin-subset variable TTFs (Latin, Latin-ext-A,
// punctuation, the currency-symbol block U+20A0–20CF). Android/iOS load TTF.
// Web gets WOFF2 instead — see fontFiles.web.ts.
// Regenerate: pyftsubset <Google Fonts variable TTF> --unicodes=<range in
// fontFiles.web.ts> --layout-features='*' [--flavor=woff2]
export const MANROPE = require('../assets/fonts/Manrope.ttf');
export const SORA = require('../assets/fonts/Sora.ttf');
