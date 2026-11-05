import { defineConfig } from 'vitest/config';

/**
 * Integration + HTTP tests against real PostgreSQL. Every test file gets its own freshly
 * migrated database (see tests/helpers/test-database.ts), so files can run in parallel.
 */
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['tests/helpers/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 180_000,
    restoreMocks: true,
  },
});
