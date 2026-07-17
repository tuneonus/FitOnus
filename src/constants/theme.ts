export const Colors = {
  light: {
    primary: '#208AEF',
    primaryLight: '#E6F4FE',
    primaryDark: '#1A6EBF',
    secondary: '#6C63FF',
    secondaryLight: '#EEEDFF',
    success: '#34C759',
    successLight: '#E8F9ED',
    warning: '#FF9F0A',
    warningLight: '#FFF4E0',
    error: '#FF3B30',
    errorLight: '#FFE8E6',
    info: '#5AC8FA',
    infoLight: '#E8F7FE',

    text: '#000000',
    textSecondary: '#60646C',
    textTertiary: '#9CA3AF',
    textInverse: '#FFFFFF',

    background: '#FFFFFF',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    backgroundSubtle: '#F7F8FA',

    border: '#E5E7EB',
    borderFocused: '#208AEF',

    overlay: 'rgba(0, 0, 0, 0.5)',

    // Chart colors
    chart1: '#208AEF',
    chart2: '#6C63FF',
    chart3: '#34C759',
    chart4: '#FF9F0A',
    chart5: '#FF3B30',
    chart6: '#5AC8FA',

    // Macro Colors
    protein: '#FF6B6B',
    carbs: '#4ECDC4',
    fat: '#FFE66D',
    fiber: '#95E1D3',

    // Recovery Score Colors
    excellent: '#34C759',
    good: '#5AC8FA',
    moderate: '#FF9F0A',
    poor: '#FF3B30',
  },
  dark: {
    primary: '#3B9FFF',
    primaryLight: '#1A2D40',
    primaryDark: '#208AEF',
    secondary: '#8B83FF',
    secondaryLight: '#1E1D30',
    success: '#30D158',
    successLight: '#0D2A14',
    warning: '#FFD60A',
    warningLight: '#2D2406',
    error: '#FF453A',
    errorLight: '#2D0A08',
    info: '#64D2FF',
    infoLight: '#0A2030',

    text: '#FFFFFF',
    textSecondary: '#B0B4BA',
    textTertiary: '#6B7280',
    textInverse: '#000000',

    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    backgroundSubtle: '#111214',

    border: '#2E3135',
    borderFocused: '#3B9FFF',

    overlay: 'rgba(0, 0, 0, 0.7)',

    // Chart colors
    chart1: '#208AEF',
    chart2: '#6C63FF',
    chart3: '#34C759',
    chart4: '#FF9F0A',
    chart5: '#FF3B30',
    chart6: '#5AC8FA',

    // Macro Colors
    protein: '#FF6B6B',
    carbs: '#4ECDC4',
    fat: '#FFE66D',
    fiber: '#95E1D3',

    // Recovery Score Colors
    excellent: '#34C759',
    good: '#5AC8FA',
    moderate: '#FF9F0A',
    poor: '#FF3B30',
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

export type ThemeColors = typeof Colors.light;
