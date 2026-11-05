import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getMigrationStatus, runMigrations } from '../../../src/database/migration-runner.js';
import { createTestDatabase, MIGRATIONS_DIR, type TestDatabase } from '../../helpers/test-database.js';

describe('migration runner against PostgreSQL', () => {
  let db: TestDatabase;
  let tempDir: string;

  beforeAll(async () => {
    db = await createTestDatabase({ migrate: false });
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'migrations-int-'));
  });
  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
    await db.drop();
  });

  it('applies every migration once, even when runners start concurrently', async () => {
    const results = await Promise.all([
      runMigrations({ pool: db.pool, directory: MIGRATIONS_DIR }),
      runMigrations({ pool: db.pool, directory: MIGRATIONS_DIR }),
      runMigrations({ pool: db.pool, directory: MIGRATIONS_DIR }),
    ]);
    const appliedCounts = results.map((result) => result.applied.length).sort();
    expect(appliedCounts).toEqual([0, 0, 3]);

    const status = await getMigrationStatus({ pool: db.pool, directory: MIGRATIONS_DIR });
    expect(status.every((entry) => entry.appliedAt !== null)).toBe(true);

    const { rows } = await db.pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    );
    expect(rows.map((row) => row.table_name)).toEqual([
      'auth_sessions',
      'idempotency_keys',
      'schema_migrations',
      'users',
    ]);
  });

  it('is a no-op when everything is applied', async () => {
    await expect(runMigrations({ pool: db.pool, directory: MIGRATIONS_DIR })).resolves.toEqual({
      applied: [],
    });
  });

  it('refuses to run when an applied migration was edited', async () => {
    await cp(MIGRATIONS_DIR, tempDir, { recursive: true });
    await writeFile(path.join(tempDir, '0001_create_users.sql'), '-- edited after the fact\nSELECT 1;');
    await expect(runMigrations({ pool: db.pool, directory: tempDir })).rejects.toThrow(
      /was modified after it was applied/,
    );
  });

  it('rolls back a failing migration completely', async () => {
    await rm(tempDir, { recursive: true, force: true });
    await cp(MIGRATIONS_DIR, tempDir, { recursive: true });
    await writeFile(
      path.join(tempDir, '0999_broken.sql'),
      'CREATE TABLE half_done (id int);\nSELECT * FROM table_that_does_not_exist;',
    );
    await expect(runMigrations({ pool: db.pool, directory: tempDir })).rejects.toThrow();

    const { rows } = await db.pool.query(`SELECT to_regclass('public.half_done') AS table_oid`);
    expect(rows[0]).toEqual({ table_oid: null });
    const applied = await db.pool.query('SELECT 1 FROM schema_migrations WHERE version = 999');
    expect(applied.rowCount).toBe(0);
  });
});
