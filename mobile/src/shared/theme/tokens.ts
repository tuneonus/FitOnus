export const colorTokens = {
  primary: '#C7EF72', // Lime — primary actions, recovery, AI
  primaryInk: '#192812', // Text on primary
  primaryStrong: '#42651E', // Lime readable on light surfaces
  background: '#F5F5F0',
  surface: '#FFFFFF',
  surfaceAlt: '#EAEDE5',
  border: '#DCE2D8',
  text: '#17231D',
  mutedText: '#606C63',
  hero: '#14291F', // Inverse AI surfaces
  heroInk: '#F4F4EE',
  heroMuted: '#B1C1B4',
  success: '#168C40',
  warning: '#D6780A',
  error: '#D62828',
  sleep: '#605AAB',
  move: '#B14C32',
  steps: '#147A91',
} as const;

export const darkColorTokens = {
  primary: '#C7EF72',
  primaryInk: '#192812',
  primaryStrong: '#C7EF72',
  background: '#101713',
  surface: '#1A251E',
  surfaceAlt: '#243128',
  border: '#35453A',
  text: '#F4F4EE',
  mutedText: '#A6B5A8',
  hero: '#1A3024',
  heroInk: '#F4F4EE',
  heroMuted: '#B1C1B4',
  success: '#4ADE80',
  warning: '#FBBF24',
  error: '#F87171',
  sleep: '#818CF8',
  move: '#F2A080',
  steps: '#38BDF8',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, screenX: 16 } as const;

export const radius = { control: 16, card: 24, sheet: 28, pill: 9999 } as const;

export const motionTokens = {
  fast: 150,
  base: 220,
  sheet: 280,
} as const;
