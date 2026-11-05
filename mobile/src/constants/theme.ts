export const Colors = {
  light: {
    // Magic Patterns tokens
    accent: '#C8F53C',
    accentInk: '#141805',
    accentStrong: '#5C8000',
    bg: '#F4F3EE',
    surface: '#FFFFFF',
    surface2: '#ECEBE5',
    ink: '#111210',
    muted: '#5C5D56',
    line: '#E2E0D8',
    hero: '#141612',
    heroInk: '#F4F4EE',
    heroMuted: '#A4A69A',
    good: '#168C40',
    warn: '#D6780A',
    bad: '#D62828',
    sleep: '#6366F1',
    move: '#F45430',
    sky: '#0E96DC',

    // Compatible aliases
    primary: '#C8F53C',
    primaryLight: '#E8FAB8',
    primaryDark: '#5C8000',
    secondary: '#111210',
    secondaryLight: '#ECEBE5',
    success: '#168C40',
    successLight: '#E2F7E8',
    warning: '#D6780A',
    warningLight: '#FDF1DE',
    error: '#D62828',
    errorLight: '#FCEAEA',
    info: '#0E96DC',
    infoLight: '#E3F4FC',

    text: '#111210',
    textSecondary: '#5C5D56',
    textTertiary: '#9C9D94',
    textInverse: '#141805',

    background: '#F4F3EE',
    backgroundElement: '#ECEBE5',
    backgroundSelected: '#E2E0D8',
    backgroundSubtle: '#FFFFFF',

    border: '#E2E0D8',
    borderFocused: '#111210',

    overlay: 'rgba(0, 0, 0, 0.45)',

    // Chart colors
    chart1: '#C8F53C',
    chart2: '#F45430',
    chart3: '#0E96DC',
    chart4: '#6366F1',
    chart5: '#168C40',
    chart6: '#D6780A',

    // Macro Colors
    protein: '#F45430',
    carbs: '#C8F53C',
    fat: '#0E96DC',
    fiber: '#168C40',

    // Recovery Score Colors
    excellent: '#168C40',
    recoveryGood: '#C8F53C',
    moderate: '#D6780A',
    poor: '#D62828',
  },
  dark: {
    // Magic Patterns tokens
    accent: '#C8F53C',
    accentInk: '#141805',
    accentStrong: '#C8F53C',
    bg: '#0A0B0A',
    surface: '#161715',
    surface2: '#222320',
    ink: '#F4F4EE',
    muted: '#9C9D94',
    line: '#2A2B27',
    hero: '#1C1E19',
    heroInk: '#F4F4EE',
    heroMuted: '#A4A69A',
    good: '#4ADE80',
    warn: '#FBBF24',
    bad: '#F87171',
    sleep: '#818CF8',
    move: '#FF7050',
    sky: '#38BDF8',

    // Compatible aliases
    primary: '#C8F53C',
    primaryLight: '#26330E',
    primaryDark: '#A8DB28',
    secondary: '#F4F4EE',
    secondaryLight: '#222320',
    success: '#4ADE80',
    successLight: '#112F1B',
    warning: '#FBBF24',
    warningLight: '#35290A',
    error: '#F87171',
    errorLight: '#381616',
    info: '#38BDF8',
    infoLight: '#0E2938',

    text: '#F4F4EE',
    textSecondary: '#9C9D94',
    textTertiary: '#5C5D56',
    textInverse: '#141805',

    background: '#0A0B0A',
    backgroundElement: '#161715',
    backgroundSelected: '#222320',
    backgroundSubtle: '#1C1E19',

    border: '#2A2B27',
    borderFocused: '#C8F53C',

    overlay: 'rgba(0, 0, 0, 0.7)',

    // Chart colors
    chart1: '#C8F53C',
    chart2: '#FF7050',
    chart3: '#38BDF8',
    chart4: '#818CF8',
    chart5: '#4ADE80',
    chart6: '#FBBF24',

    // Macro Colors
    protein: '#FF7050',
    carbs: '#C8F53C',
    fat: '#38BDF8',
    fiber: '#4ADE80',

    // Recovery Score Colors
    excellent: '#4ADE80',
    recoveryGood: '#C8F53C',
    moderate: '#FBBF24',
    poor: '#F87171',
  },
};

export const Typography = {
  displayLarge: { fontSize: 34, lineHeight: 41, fontWeight: '700' as const, letterSpacing: 0.37 },
  displayMedium: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const, letterSpacing: 0.36 },
  displaySmall: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const, letterSpacing: 0.35 },

  headlineLarge: { fontSize: 20, lineHeight: 25, fontWeight: '600' as const, letterSpacing: 0.38 },
  headlineMedium: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const, letterSpacing: -0.41 },
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

export type ThemeColors = typeof Colors.light;
