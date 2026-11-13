// OnusFit brand: blue and orange sampled from the logo.
export const colorTokens = {
  primary: '#0D1B4C', // TuneStack navy — primary actions, links, active states
  primaryInk: '#FFFFFF', // Text on primary
  primaryStrong: '#0D1B4C', // Navy readable on light surfaces
  highlight: '#FD6D01', // Brand orange — highlights, streaks, AI Coach
  highlightInk: '#1A1200', // Text on orange (white on orange is only 2.9:1)
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F3F5F9',
  border: '#D5DBE5',
  text: '#0E1726',
  mutedText: '#667084',
  hero: '#0D1B4C', // Inverse AI surfaces (TuneStack navy)
  heroInk: '#FFFFFF',
  heroMuted: '#C4CFE5',
  success: '#0B7F47',
  warning: '#A06200',
  error: '#D6293E',
  sleep: '#605AAB',
  move: '#E65F00',
  steps: '#147A91',
} as const;

export const darkColorTokens = {
  primary: '#0A56CC', // TuneStack dark primary fill
  primaryInk: '#FFFFFF',
  primaryStrong: '#BBC4D1', // TuneStack dark brand[500]: accent text and icons on dark surfaces
  highlight: '#FF7801',
  highlightInk: '#1A1200',
  background: '#0B0F17',
  surface: '#141A25',
  surfaceAlt: '#1A202C',
  border: '#2B3342',
  text: '#F1F4F9',
  mutedText: '#8A94A8',
  hero: '#0D1B4C',
  heroInk: '#F1F4F9',
  heroMuted: '#C4CFE5',
  success: '#3CCF80',
  warning: '#F2A93B',
  error: '#F26D7C',
  sleep: '#818CF8',
  move: '#FF8A33',
  steps: '#38BDF8',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, screenX: 16 } as const;

export const radius = { control: 16, card: 24, sheet: 28, pill: 9999 } as const;

export const motionTokens = {
  fast: 150,
  base: 220,
  sheet: 280,
} as const;
