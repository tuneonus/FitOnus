import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabaseAdminUrl: string;
  }
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Provides an admin connection to a disposable PostgreSQL server.
 *
 * Default: starts a Testcontainers PostgreSQL (requires Docker).
 * Override: TEST_DATABASE_ADMIN_URL pointing at a *local* server you own. Tests only ever
 * create and drop databases named test_<random>, but a remote URL is still refused.
 */
export default async function setup(project: TestProject): Promise<(() => Promise<void>) | undefined> {
  const override = process.env.TEST_DATABASE_ADMIN_URL;
  if (override) {
    const host = new URL(override).hostname;
    if (!LOCAL_HOSTS.has(host)) {
      throw new Error(`TEST_DATABASE_ADMIN_URL must point at localhost, got "${host}"`);
    }
    project.provide('testDatabaseAdminUrl', override);
    return undefined;
  }

  const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  project.provide('testDatabaseAdminUrl', container.getConnectionUri());
  return async () => {
    await container.stop();
  };
}
