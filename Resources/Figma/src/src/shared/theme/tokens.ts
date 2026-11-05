/**
 * FitOnus design tokens.
 * Colors are CSS variables (see index.css) exposed as Tailwind classes, so the
 * same token names map 1:1 to a future React Native theme object.
 */
export const colorTokens = {
  primary: 'accent', // Lime — primary actions, recovery, AI
  primaryInk: 'accentInk', // Text on primary
  primaryStrong: 'accentStrong', // Lime readable on light surfaces
  background: 'bg',
  surface: 'surface',
  surfaceAlt: 'surface2',
  border: 'line',
  text: 'ink',
  mutedText: 'muted',
  hero: 'hero', // Inverse AI surfaces
  success: 'good',
  warning: 'warn',
  error: 'bad',
  sleep: 'sleep',
  move: 'move',
  steps: 'sky'
} as const;

export const typography = {
  display: 'font-mono text-[40px] font-semibold leading-none tracking-[-0.04em]',
  numeric: 'font-mono font-semibold tracking-[-0.02em]',
  h1: 'text-[28px] font-semibold leading-tight tracking-[-0.02em]',
  h2: 'text-[22px] font-semibold leading-tight tracking-[-0.02em]',
  h3: 'text-[17px] font-semibold tracking-[-0.01em]',
  body: 'text-[15px] leading-relaxed',
  bodySm: 'text-[13.5px] leading-relaxed',
  caption: 'text-[12px]'
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, screenX: 16 } as const;

export const radius = { control: 16, card: 24, sheet: 28, pill: 999 } as const;

export const motionTokens = {
  ease: [0.23, 1, 0.32, 1] as [number, number, number, number],
  fast: 0.15,
  base: 0.22,
  sheet: 0.28
} as const;