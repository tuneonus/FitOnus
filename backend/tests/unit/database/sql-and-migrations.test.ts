import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checksumOf,
  loadMigrations,
  parseMigrationFilename,
} from '../../../src/database/migration-runner.js';
import { escapeLike, orderByClause, quoteIdentifier } from '../../../src/database/sql.js';
import { MIGRATIONS_DIR } from '../../helpers/test-database.js';

describe('SQL helpers', () => {
  it('escapes LIKE wildcards', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
  });

  it('quotes only safe identifiers', () => {
    expect(quoteIdentifier('test_abc123')).toBe('"test_abc123"');
    for (const unsafe of ['users; DROP TABLE users', 'a"b', 'Upper', '', '1abc']) {
      expect(() => quoteIdentifier(unsafe)).toThrow(/Unsafe SQL identifier/);
    }
  });

  it('builds ORDER BY only from whitelisted columns', () => {
    const columns = { createdAt: 'created_at' } as const;
    expect(orderByClause(columns, 'createdAt', 'asc')).toBe('ORDER BY "created_at" ASC, "id" ASC');
    expect(() => orderByClause<string>(columns as Record<string, string>, 'password_hash', 'asc')).toThrow(
      /Unknown sort key/,
    );
  });
});

describe('migration files', () => {
  let tempDir: string | undefined;
  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  it('parses versioned snake_case filenames only', () => {
    expect(parseMigrationFilename('0001_create_users.sql')).toEqual({ version: 1, name: 'create_users' });
    expect(parseMigrationFilename('1_create.sql')).toBeNull();
    expect(parseMigrationFilename('0002_Create-Users.sql')).toBeNull();
  });

  it('normalises line endings before checksumming', () => {
    expect(checksumOf('SELECT 1;\r\nSELECT 2;\r\n')).toBe(checksumOf('SELECT 1;\nSELECT 2;\n'));
  });

  it('loads the project migrations in order with unique versions', async () => {
    const migrations = await loadMigrations(MIGRATIONS_DIR);
    const versions = migrations.map((migration) => migration.version);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(new Set(versions).size).toBe(versions.length);
    expect(migrations.every((migration) => migration.transactional)).toBe(true);
  });

  it('rejects duplicate versions and honours the no-transaction directive', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'migrations-'));
    await writeFile(path.join(tempDir, '0001_a.sql'), '-- migrate:no-transaction\nSELECT 1;');
    expect((await loadMigrations(tempDir))[0]!.transactional).toBe(false);

    await writeFile(path.join(tempDir, '0001_b.sql'), 'SELECT 1;');
    await expect(loadMigrations(tempDir)).rejects.toThrow(/Duplicate migration version 1/);
  });
});
