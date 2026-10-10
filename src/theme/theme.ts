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
  chart1: '#1447E6',
  chart2: '#00BC7D',
  chart3: '#FE9A00',
  chart4: '#AD46FF',
  chart5: '#FF2056',

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
} as const;

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

export type ThemeColors = typeof colors;
