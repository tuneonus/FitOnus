/** Opt-in layout and type for the premium screens. Native system fonts need no download. */
export const premium = {
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, section: 40 },
  radius: { control: 14, card: 20, hero: 24, pill: 999 },
  layout: { gutter: 20, maxWidth: 640, touch: 48 },
  type: {
    display: { fontSize: 36, lineHeight: 42, fontWeight: '700', letterSpacing: -1.4 },
    number: {
      fontSize: 44,
      lineHeight: 52,
      fontWeight: '700',
      letterSpacing: -1.8,
      fontVariant: ['tabular-nums'],
    },
    title: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.6 },
    metric: {
      fontSize: 24,
      lineHeight: 32,
      fontWeight: '600',
      letterSpacing: -0.7,
      fontVariant: ['tabular-nums'],
    },
    body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
    label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
    caption: { fontSize: 12, lineHeight: 18, fontWeight: '500' },
    eyebrow: { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 1.6 },
  },
  motion: { press: 100, settle: 180 },
  chart: { inverseCarbs: '#DCE8C6', inverseFat: '#B2CBBC' },
} as const;
