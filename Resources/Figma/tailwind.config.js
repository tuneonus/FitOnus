const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: [
  './index.html',
  './src/**/*.{js,ts,jsx,tsx}'
],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        surface2: token('surface2'),
        ink: token('ink'),
        muted: token('muted'),
        line: token('line'),
        accent: token('accent'),
        accentInk: token('accent-ink'),
        accentStrong: token('accent-strong'),
        hero: token('hero'),
        heroInk: token('hero-ink'),
        heroMuted: token('hero-muted'),
        good: token('good'),
        warn: token('warn'),
        bad: token('bad'),
        sleep: token('sleep'),
        move: token('move'),
        sky: token('sky'),
      },
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
