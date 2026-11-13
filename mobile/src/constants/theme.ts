import { colorTokens, darkColorTokens } from '@/shared/theme/tokens';

export const Colors = {
  light: {
    // OnusFit brand: logo blue as the main accent, logo orange as the highlight
    accent: colorTokens.primary,
    accentInk: colorTokens.primaryInk,
    accentStrong: colorTokens.primaryStrong,
    bg: colorTokens.background,
    surface: colorTokens.surface,
    surface2: colorTokens.surfaceAlt,
    ink: colorTokens.text,
    muted: colorTokens.mutedText,
    line: colorTokens.border,
    hero: colorTokens.hero,
    heroInk: colorTokens.heroInk,
    heroMuted: colorTokens.heroMuted,
    good: colorTokens.success,
    warn: colorTokens.warning,
    bad: colorTokens.error,
    sleep: colorTokens.sleep,
    move: colorTokens.move,
    sky: colorTokens.steps,
    // Tinted accent surface and hairline separators for lists and dividers
    accentSoft: '#E2E8F4',
    lineSoft: '#E8ECF2',
    // Brand orange highlight (streaks, AI Coach, accents on dark hero surfaces)
    highlight: colorTokens.highlight,
    highlightInk: colorTokens.highlightInk,
    highlightSoft: '#FFF0E5',

    // Compatible aliases
    primary: colorTokens.primary,
    primaryLight: '#E2E8F4',
    primaryDark: colorTokens.primaryStrong,
    secondary: colorTokens.text,
    secondaryLight: colorTokens.surfaceAlt,
    success: colorTokens.success,
    successLight: '#E6F7EE',
    warning: colorTokens.warning,
    warningLight: '#FFF4E0',
    error: colorTokens.error,
    errorLight: '#FDEBEC',
    info: colorTokens.steps,
    infoLight: '#E3F4FC',

    text: colorTokens.text,
    textSecondary: colorTokens.mutedText,
    textTertiary: '#8A94A8',
    textInverse: colorTokens.primaryInk,

    background: colorTokens.background,
    backgroundElement: colorTokens.surfaceAlt,
    backgroundSelected: colorTokens.border,
    backgroundSubtle: colorTokens.surface,

    border: colorTokens.border,
    borderFocused: colorTokens.text,

    overlay: 'rgba(0, 0, 0, 0.45)',

    // Chart colors
    chart1: colorTokens.primary,
    chart2: colorTokens.move,
    chart3: colorTokens.steps,
    chart4: colorTokens.sleep,
    chart5: colorTokens.success,
    chart6: colorTokens.warning,

    // Macro Colors
    protein: colorTokens.move,
    carbs: colorTokens.primary,
    fat: colorTokens.steps,
    fiber: colorTokens.success,

    // Recovery Score Colors
    excellent: colorTokens.success,
    recoveryGood: colorTokens.primary,
    moderate: colorTokens.warning,
    poor: colorTokens.error,
  },
  dark: {
    // OnusFit brand: logo blue as the main accent, logo orange as the highlight
    accent: darkColorTokens.primary,
    accentInk: darkColorTokens.primaryInk,
    accentStrong: darkColorTokens.primaryStrong,
    bg: darkColorTokens.background,
    surface: darkColorTokens.surface,
    surface2: darkColorTokens.surfaceAlt,
    ink: darkColorTokens.heroInk,
    muted: darkColorTokens.mutedText,
    line: darkColorTokens.border,
    hero: darkColorTokens.hero,
    heroInk: darkColorTokens.heroInk,
    heroMuted: darkColorTokens.heroMuted,
    good: darkColorTokens.success,
    warn: darkColorTokens.warning,
    bad: darkColorTokens.error,
    sleep: darkColorTokens.sleep,
    move: darkColorTokens.move,
    sky: darkColorTokens.steps,
    // Tinted accent surface and hairline separators for lists and dividers
    accentSoft: '#242A34',
    lineSoft: '#202734',
    highlight: darkColorTokens.highlight,
    highlightInk: darkColorTokens.highlightInk,
    highlightSoft: 'rgba(255, 120, 1, 0.16)',

    // Compatible aliases
    primary: darkColorTokens.primaryStrong,
    primaryLight: '#242A34',
    primaryDark: '#E1E6EE',
    secondary: darkColorTokens.heroInk,
    secondaryLight: darkColorTokens.surfaceAlt,
    success: darkColorTokens.success,
    successLight: '#0D2A1C',
    warning: darkColorTokens.warning,
    warningLight: '#2E2108',
    error: darkColorTokens.error,
    errorLight: '#321418',
    info: darkColorTokens.steps,
    infoLight: '#0E2938',

    text: darkColorTokens.heroInk,
    textSecondary: darkColorTokens.mutedText,
    textTertiary: '#667084',
    textInverse: darkColorTokens.primaryInk,

    background: darkColorTokens.background,
    backgroundElement: darkColorTokens.surface,
    backgroundSelected: darkColorTokens.surfaceAlt,
    backgroundSubtle: darkColorTokens.hero,

    border: darkColorTokens.border,
    borderFocused: darkColorTokens.primaryStrong,

    overlay: 'rgba(0, 0, 0, 0.7)',

    // Chart colors
    chart1: darkColorTokens.primaryStrong,
    chart2: darkColorTokens.move,
    chart3: darkColorTokens.steps,
    chart4: darkColorTokens.sleep,
    chart5: darkColorTokens.success,
    chart6: darkColorTokens.warning,

    // Macro Colors
    protein: darkColorTokens.move,
    carbs: darkColorTokens.primaryStrong,
    fat: darkColorTokens.steps,
    fiber: darkColorTokens.success,

    // Recovery Score Colors
    excellent: darkColorTokens.success,
    recoveryGood: darkColorTokens.primaryStrong,
    moderate: darkColorTokens.warning,
    poor: darkColorTokens.error,
  },
};

export const Typography = {
  displayLarge: { fontSize: 34, lineHeight: 41, fontWeight: '700' as const, letterSpacing: 0.37 },
  displayMedium: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const, letterSpacing: 0.36 },
  displaySmall: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const, letterSpacing: 0.35 },

  headlineLarge: { fontSize: 20, lineHeight: 25, fontWeight: '600' as const, letterSpacing: 0.38 },
  headlineMedium: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600' as const,
    letterSpacing: -0.41,
  },
  headlineSmall: { fontSize: 15, lineHeight: 20, fontWeight: '600' as const, letterSpacing: -0.24 },

  bodyLarge: { fontSize: 17, lineHeight: 22, fontWeight: '400' as const, letterSpacing: -0.41 },
  bodyMedium: { fontSize: 15, lineHeight: 20, fontWeight: '400' as const, letterSpacing: -0.24 },
  bodySmall: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const, letterSpacing: -0.08 },

  labelLarge: { fontSize: 15, lineHeight: 20, fontWeight: '500' as const, letterSpacing: -0.24 },
  labelMedium: { fontSize: 13, lineHeight: 18, fontWeight: '500' as const, letterSpacing: -0.08 },
  labelSmall: { fontSize: 11, lineHeight: 13, fontWeight: '500' as const, letterSpacing: 0.07 },

  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const, letterSpacing: 0 },
  overline: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600' as const,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
};

export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  huge: 64,
};

export const BorderRadius = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
};

/**
 * TuneStack shadows: boxShadow (follows border radius, unlike Android elevation),
 * tinted with the darkest ink. Dark themes drop them and rely on borders.
 */
const none = { boxShadow: '0px 0px 0px rgba(0, 0, 0, 0)' };
export const Shadows = {
  light: {
    shadowNone: none,
    shadowSmall: { boxShadow: '0px 1px 3px rgba(14, 23, 38, 0.06)' },
    shadowMedium: { boxShadow: '0px 6px 20px rgba(14, 23, 38, 0.12)' },
    shadowLarge: { boxShadow: '0px -2px 16px rgba(14, 23, 38, 0.07)' },
    shadowXLarge: { boxShadow: '0px -8px 32px rgba(14, 23, 38, 0.16)' },
  },
  dark: {
    shadowNone: none,
    shadowSmall: none,
    shadowMedium: none,
    shadowLarge: none,
    shadowXLarge: none,
  },
};

export const Animations = {
  springDefault: { damping: 15, stiffness: 150, mass: 1 },
  springSnappy: { damping: 20, stiffness: 300, mass: 0.8 },
  springGentle: { damping: 20, stiffness: 100, mass: 1 },
  springBouncy: { damping: 10, stiffness: 150, mass: 0.8 },

  durationInstant: 100,
  durationFast: 200,
  durationNormal: 300,
  durationSlow: 500,
  durationCeremonial: 800,
};

export const radiusTokens = {
  control: 16,
  card: 24,
  sheet: 28,
  pill: 9999,
} as const;

export const spacingTokens = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  screenX: 16,
} as const;

// Keep semantic keys exact while allowing light and dark values to differ.
export type ThemeColors = { [Key in keyof typeof Colors.light]: string };
