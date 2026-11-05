import { randomBytes } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
import { inject } from 'vitest';
import { runMigrations } from '../../src/database/migration-runner.js';
import { createPool } from '../../src/database/pool.js';
import { quoteIdentifier } from '../../src/database/sql.js';

export const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../../migrations');

export interface TestDatabase {
  name: string;
  url: string;
  pool: pg.Pool;
  drop(): Promise<void>;
}

async function withAdmin<T>(work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: inject('testDatabaseAdminUrl') });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/** Creates an isolated database `test_<random>`, optionally migrated. Always drop it in afterAll. */
export async function createTestDatabase(options: { migrate?: boolean } = {}): Promise<TestDatabase> {
  const name = `test_${randomBytes(6).toString('hex')}`;
  await withAdmin((client) => client.query(`CREATE DATABASE ${quoteIdentifier(name)}`));

  const url = new URL(inject('testDatabaseAdminUrl'));
  url.pathname = `/${name}`;
  const pool = createPool({
    url: url.toString(),
    poolMax: 10,
    connectionTimeoutMs: 5_000,
    idleTimeoutMs: 10_000,
    statementTimeoutMs: 10_000,
    ssl: 'disable',
  });
  if (options.migrate !== false) await runMigrations({ pool, directory: MIGRATIONS_DIR });

  return {
    name,
    url: url.toString(),
    pool,
    drop: async () => {
      await pool.end();
      if (!/^test_[0-9a-f]{12}$/.test(name)) throw new Error(`Refusing to drop unexpected database ${name}`);
      await withAdmin((client) =>
        client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(name)} WITH (FORCE)`),
      );
    },
  };
}
