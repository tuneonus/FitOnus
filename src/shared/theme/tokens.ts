export const colorTokens = {
  primary: '#C8F53C', // Lime — primary actions, recovery, AI
  primaryInk: '#141805', // Text on primary
  primaryStrong: '#5C8000', // Lime readable on light surfaces
  background: '#F4F3EE',
  surface: '#FFFFFF',
  surfaceAlt: '#ECEBE5',
  border: '#E2E0D8',
  text: '#111210',
  mutedText: '#5C5D56',
  hero: '#141612', // Inverse AI surfaces
  heroInk: '#F4F4EE',
  heroMuted: '#A4A69A',
  success: '#168C40',
  warning: '#D6780A',
  error: '#D62828',
  sleep: '#6366F1',
  move: '#F45430',
  steps: '#0E96DC'
} as const;

export const darkColorTokens = {
  primary: '#C8F53C',
  primaryInk: '#141805',
  primaryStrong: '#C8F53C',
  background: '#0A0B0A',
  surface: '#161715',
  surfaceAlt: '#222320',
  border: '#2A2B27',
  text: '#F4F4EE',
  mutedText: '#9C9D94',
  hero: '#1C1E19',
  heroInk: '#F4F4EE',
  heroMuted: '#A4A69A',
  success: '#4ADE80',
  warning: '#FBBF24',
  error: '#F87171',
  sleep: '#818CF8',
  move: '#FF7050',
  steps: '#38BDF8'
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, screenX: 16 } as const;

export const radius = { control: 16, card: 24, sheet: 28, pill: 9999 } as const;

export const motionTokens = {
  fast: 150,
  base: 220,
  sheet: 280
} as const;
