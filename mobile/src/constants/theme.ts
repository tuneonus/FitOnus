import { colorTokens, darkColorTokens } from '@/shared/theme/tokens';

export const Colors = {
  light: {
    // FitOnus: chalk, forest, and a single athletic citron accent
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
    accentSoft: '#EEF6DC',
    lineSoft: '#E7EBE3',

    // Compatible aliases
    primary: colorTokens.primary,
    primaryLight: '#ECF5DC',
    primaryDark: colorTokens.primaryStrong,
    secondary: colorTokens.text,
    secondaryLight: colorTokens.surfaceAlt,
    success: colorTokens.success,
    successLight: '#E2F7E8',
    warning: colorTokens.warning,
    warningLight: '#FDF1DE',
    error: colorTokens.error,
    errorLight: '#FCEAEA',
    info: colorTokens.steps,
    infoLight: '#E3F4FC',

    text: colorTokens.text,
    textSecondary: colorTokens.mutedText,
    textTertiary: '#A6B5A8',
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
    // FitOnus: chalk, forest, and a single athletic citron accent
    accent: darkColorTokens.primaryStrong,
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
    accentSoft: 'rgba(199, 239, 114, 0.13)',
    lineSoft: '#2A372F',

    // Compatible aliases
    primary: darkColorTokens.primaryStrong,
    primaryLight: '#253819',
    primaryDark: '#ADD55D',
    secondary: darkColorTokens.heroInk,
    secondaryLight: darkColorTokens.surfaceAlt,
    success: darkColorTokens.success,
    successLight: '#112F1B',
    warning: darkColorTokens.warning,
    warningLight: '#35290A',
    error: darkColorTokens.error,
    errorLight: '#381616',
    info: darkColorTokens.steps,
    infoLight: '#0E2938',

    text: darkColorTokens.heroInk,
    textSecondary: darkColorTokens.mutedText,
    textTertiary: '#606C63',
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

export const Shadows = {
  light: {
    shadowNone: {
      shadowColor: 'transparent',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    shadowSmall: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    shadowMedium: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 4,
    },
    shadowLarge: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
      elevation: 8,
    },
    shadowXLarge: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.16,
      shadowRadius: 24,
      elevation: 12,
    },
  },
  dark: {
    // In dark mode, we usually rely on border colors rather than shadows for elevation.
    shadowNone: {
      shadowColor: 'transparent',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    shadowSmall: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.3,
      shadowRadius: 3,
      elevation: 2,
    },
    shadowMedium: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 4,
    },
    shadowLarge: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.5,
      shadowRadius: 16,
      elevation: 8,
    },
    shadowXLarge: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.6,
      shadowRadius: 24,
      elevation: 12,
    },
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
