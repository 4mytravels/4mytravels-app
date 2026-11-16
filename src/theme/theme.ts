// Design tokens — converted from the Lovable "My Travel Compass" design system
// (src/styles.css, dark theme). oklch values were converted to sRGB hex because
// React Native does not support oklch. Fonts: Manrope (body) + Sora (headings).

export const colors = {
  // core
  background: '#0A0A1A', // oklch(0.155 0.034 281.738)
  foreground: '#E2E8F0', // oklch(0.929 0.013 255.508)
  card: '#141432', // oklch(0.210 0.058 280.217)
  cardForeground: '#E2E8F0',
  popover: '#141432',

  primary: '#6366F1', // oklch(0.585 0.204 277.117) — the periwinkle accent
  primaryForeground: '#FFFFFF',
  // Q9 contrast: `primary` is 4.47:1 under white text and 4.0:1 as text on a
  // card — both just below WCAG AA. Use primarySolid for filled controls with
  // white labels (button, FAB, active nav: 6.3:1) and primaryText for accent
  // text/icons on dark surfaces (9.0:1). `primary` stays for bars/borders.
  primarySolid: '#4F46E5', // indigo-600
  primaryText: '#A5B4FC', // indigo-300
  secondary: '#18203A', // oklch(0.250 0.050 270.000)
  secondaryForeground: '#E2E8F0',

  muted: '#18203A',
  mutedForeground: '#909FB8', // oklch(0.700 0.040 260.000)

  accent: '#A78BFA', // oklch(0.709 0.159 293.541)
  accentForeground: '#0A0A1A',

  destructive: '#FF6467', // oklch(0.704 0.191 22.216)
  destructiveForeground: '#0A0A1A',

  border: 'rgba(255,255,255,0.10)', // oklch(1 0 0 / 10%)
  borderStrong: 'rgba(255,255,255,0.12)',
  input: 'rgba(255,255,255,0.15)', // oklch(1 0 0 / 15%)
  ring: '#6366F1',

  // domain-specific (from :root + .dark)
  success: '#35D399', // oklch(0.773 0.153 163.223)
  routeLine: '#21D3EE', // oklch(0.797 0.134 211.530)
  visitedDot: '#FBBF25', // oklch(0.837 0.164 84.429)
  globeGlow: 'rgba(99,102,241,0.25)',

  // chart palette (statistics)
  // Q9: Tailwind *-400 — every series ≥ 6:1 on `card` (chart1 was 2.6:1).
  chart1: '#818CF8', // indigo-400
  chart2: '#34D399', // emerald-400
  chart3: '#FBBF24', // amber-400
  chart4: '#C084FC', // purple-400
  chart5: '#FB7185', // rose-400

  // surface opacities (refined design — white overlays for depth)
  surfaceSoft: 'rgba(255,255,255,0.04)',
  surfaceMedium: 'rgba(255,255,255,0.06)',
  surfaceStrong: 'rgba(255,255,255,0.08)',

  // primary tints (selected states, not solid)
  primary12: 'rgba(99,102,241,0.12)',
  primary20: 'rgba(99,102,241,0.20)',
  primary28: 'rgba(99,102,241,0.28)',
  primaryBorder: 'rgba(99,102,241,0.44)',
  // Trip-card day-bar fill. Translucent ON PURPOSE: the bar sits directly on
  // the cover photo, so a solid fill hid the image underneath it. 55% keeps the
  // progress readable while the photo stays visible through it.
  primaryBar: 'rgba(99,102,241,0.55)',
  mutedBar: 'rgba(144,159,184,0.45)',

  // success tint
  success15: 'rgba(53,211,153,0.15)',

  // nav
  navSurface: 'rgba(20,20,50,0.85)',

  // blacks
  black20: 'rgba(0,0,0,0.20)',
  black48: 'rgba(0,0,0,0.48)',

  // Q11 status set (Tailwind *-400 text on dark; *15 = tinted surface, *Border = outline)
  warning: '#FBBF24',
  warning15: 'rgba(251,191,36,0.15)',
  warningBorder: 'rgba(251,191,36,0.40)',
  danger: '#FB7185',
  danger15: 'rgba(251,113,133,0.15)',
  dangerBorder: 'rgba(251,113,133,0.40)',
  info: '#60A5FA',
  info15: 'rgba(96,165,250,0.15)',
  infoBorder: 'rgba(96,165,250,0.40)',
  teal: '#2DD4BF',
  teal15: 'rgba(45,212,191,0.15)',
  tealBorder: 'rgba(45,212,191,0.40)',
  successBorder: 'rgba(53,211,153,0.40)',

  // Q11 overlays: modal backdrop, and text/icons placed on a cover photo
  scrim: 'rgba(5,5,15,0.64)',
  onImage: '#FFFFFF',
  onImageMuted: 'rgba(255,255,255,0.80)',
  imageGradientTop: 'rgba(0,0,0,0)',
  imageGradientBottom: 'rgba(0,0,0,0.72)',

  // M3: every literal that used to live in a screen/component, as a token with
  // its EXACT old value (migration = zero visual change). New code picks from
  // the semantic tokens above; these exist so no hex/rgba remains outside
  // src/theme/ (enforced by the no-restricted-syntax lint rule).
  white: '#FFFFFF',
  black: '#000000',
  backdrop: 'rgba(0,0,0,0.6)',
  backdropSoft: 'rgba(0,0,0,0.5)',
  backdropStrong: 'rgba(0,0,0,0.95)',
  scrimStrong: 'rgba(5,5,15,0.72)',
  black45: 'rgba(0,0,0,0.45)',
  white15: 'rgba(255,255,255,0.15)',
  white35: 'rgba(255,255,255,0.35)',
  foreground28: 'rgba(226,232,240,0.28)',
  white20: 'rgba(255,255,255,0.20)',
  white22: 'rgba(255,255,255,0.22)',
  white28: 'rgba(255,255,255,0.28)',
  foreground72: 'rgba(226,232,240,0.72)',
  foreground82: 'rgba(226,232,240,0.82)',
  slate22: 'rgba(148,163,184,0.22)',
  pastVeil: 'rgba(10,10,26,0.46)',
  red400: '#F87171',
  red12: 'rgba(239,68,68,0.12)',
  amberNoticeSurface: '#2A2214', // amber @16% over background, as a solid
  amberNoticeBorder: 'rgba(251,191,36,0.30)',
  redNoticeSurface: '#2C1A1C', // red @18% over background, as a solid
  redNoticeBorder: 'rgba(248,113,113,0.35)',
  primaryNoticeSurface: '#1A1B41', // #6366F1 @18% over background, as a solid
  amber10: 'rgba(251,191,36,0.10)',
  blue28: 'rgba(59,130,246,0.28)',
  blue200: '#BFDBFE',
  teal32: 'rgba(13,148,136,0.32)',
  teal300: '#5EEAD4',
  amber500: '#F59E0B',
  noPhoto1: '#1B1E46',
  noPhoto2: '#2A2560',
} as const;

// Statistics donut: top 5 categories + "Others" (moved out of the screen, M3).
export const donutPalette = [
  '#6366F1', // periwinkle blue
  '#EF4444', // coral red
  '#10B981', // mint green
  '#F59E0B', // soft orange
  '#8B5CF6', // lavender purple
  '#6B7280', // gray — Others
] as const;

export const radius = {
  sm: 12,
  md: 14,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  full: 9999,
} as const;

export const fontFamily = {
  sans: 'Manrope',
  heading: 'Sora',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
} as const;

export const fontSize = {
  xs: 11,
  sm: 12,
  base: 13,
  md: 14,
  lg: 16,
  xl: 18,
  '2xl': 20,
  '3xl': 24,
  '4xl': 28,
  '5xl': 32,
} as const;

// Q11 target type scale (11/12/14/16/20/24/28/34). Definitions only: screens
// still use `fontSize` above and move over during M2/M3 (`<Text variant>`).
export const typeScale = {
  caption: 11,
  label: 12,
  body: 14,
  bodyLg: 16,
  title: 20,
  titleLg: 24,
  display: 28,
  displayLg: 34,
} as const;

// Q11 icon sizes; touch targets stay >= 44 regardless of glyph size (M2 IconButton).
export const iconSize = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
} as const;

export const touchTarget = 44;

// Shadow tokens (refined design)
export const fabShadow = {
  shadowColor: '#6366F1',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.40,
  shadowRadius: 16,
  elevation: 10,
};

export const navShadow = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 12 },
  shadowOpacity: 0.48,
  shadowRadius: 36,
  elevation: 14,
};

export const cardShadow = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.18,
  shadowRadius: 30,
  elevation: 5,
};

export const focusShadow = {
  shadowColor: '#6366F1',
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.20,
  shadowRadius: 3,
  elevation: 0,
};

// Q13: text that sits on a photo (trip cover). The scrim carries most of the
// contrast; this shadow keeps the name/dates legible on a white/bright photo
// where the gradient alone is not enough.
export const onImageTextShadow = {
  textShadowColor: 'rgba(0,0,0,0.55)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 4,
};

export type ThemeColors = typeof colors;
