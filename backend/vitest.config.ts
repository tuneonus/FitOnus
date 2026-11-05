import { defineConfig } from 'vitest/config';

/** Unit tests: no database, no network. */
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
  },
});
