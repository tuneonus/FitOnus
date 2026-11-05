import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type pg from 'pg';

export interface Migration {
  version: number;
  name: string;
  filename: string;
  sql: string;
  checksum: string;
  transactional: boolean;
}

export interface MigrationStatus {
  version: number;
  name: string;
  appliedAt: Date | null;
}

const FILE_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/;
const NO_TRANSACTION_DIRECTIVE = /^--\s*migrate:no-transaction\s*$/m;
/** Arbitrary constant shared by every runner; serialises concurrent migrations. */
const ADVISORY_LOCK_KEY = 72_410_318;

type Log = (message: string) => void;

/** Line endings are normalised so checksums match across Windows and Linux checkouts. */
export const checksumOf = (sql: string): string =>
  createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');

export function parseMigrationFilename(filename: string): { version: number; name: string } | null {
  const match = FILE_PATTERN.exec(filename);
  if (!match) return null;
  return { version: Number(match[1]), name: match[2]! };
}

export async function loadMigrations(directory: string): Promise<Migration[]> {
  const entries = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
  const migrations: Migration[] = [];
  const seen = new Set<number>();

  for (const filename of entries) {
    const parsed = parseMigrationFilename(filename);
    if (!parsed) throw new Error(`Invalid migration filename "${filename}" (expected NNNN_snake_case.sql)`);
    if (seen.has(parsed.version)) throw new Error(`Duplicate migration version ${parsed.version}`);
    seen.add(parsed.version);

    const sql = await readFile(path.join(directory, filename), 'utf8');
    migrations.push({
      ...parsed,
      filename,
      sql,
      checksum: checksumOf(sql),
      transactional: !NO_TRANSACTION_DIRECTIVE.test(sql),
    });
  }
  return migrations;
}

const ENSURE_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version      integer     PRIMARY KEY,
    name         text        NOT NULL,
    checksum     text        NOT NULL,
    applied_at   timestamptz NOT NULL DEFAULT now(),
    execution_ms integer     NOT NULL
  )`;

async function appliedChecksums(
  client: pg.PoolClient,
): Promise<Map<number, { name: string; checksum: string; appliedAt: Date }>> {
  const { rows } = await client.query<{ version: number; name: string; checksum: string; applied_at: Date }>(
    'SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version',
  );
  return new Map(
    rows.map((row) => [row.version, { name: row.name, checksum: row.checksum, appliedAt: row.applied_at }]),
  );
}

/** Refuses to continue when history was edited or a file was deleted after being applied. */
function verifyHistory(
  migrations: Migration[],
  applied: Map<number, { name: string; checksum: string }>,
): void {
  const byVersion = new Map(migrations.map((migration) => [migration.version, migration]));
  for (const [version, record] of applied) {
    const file = byVersion.get(version);
    if (!file)
      throw new Error(
        `Applied migration ${version} (${record.name}) is missing from the migrations directory`,
      );
    if (file.checksum !== record.checksum) {
      throw new Error(
        `Migration ${file.filename} was modified after it was applied; add a new migration instead`,
      );
    }
  }
}

async function withLock<T>(pool: pg.Pool, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    try {
      await client.query(ENSURE_TABLE);
      return await work(client);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

async function apply(client: pg.PoolClient, migration: Migration): Promise<void> {
  const started = Date.now();
  const record = () =>
    client.query(
      'INSERT INTO schema_migrations (version, name, checksum, execution_ms) VALUES ($1, $2, $3, $4)',
      [migration.version, migration.name, migration.checksum, Date.now() - started],
    );

  if (!migration.transactional) {
    // e.g. CREATE INDEX CONCURRENTLY. Such files must be written to be safely re-runnable.
    await client.query(migration.sql);
    await record();
    return;
  }
  await client.query('BEGIN');
  try {
    await client.query(migration.sql);
    await record();
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function runMigrations(options: {
  pool: pg.Pool;
  directory: string;
  log?: Log;
}): Promise<{ applied: string[] }> {
  const log = options.log ?? (() => undefined);
  const migrations = await loadMigrations(options.directory);

  return withLock(options.pool, async (client) => {
    const applied = await appliedChecksums(client);
    verifyHistory(migrations, applied);

    const pending = migrations.filter((migration) => !applied.has(migration.version));
    if (pending.length === 0) log('Database schema is up to date.');

    for (const migration of pending) {
      log(`Applying ${migration.filename}`);
      await apply(client, migration);
    }
    return { applied: pending.map((migration) => migration.filename) };
  });
}

export async function getMigrationStatus(options: {
  pool: pg.Pool;
  directory: string;
}): Promise<MigrationStatus[]> {
  const migrations = await loadMigrations(options.directory);
  return withLock(options.pool, async (client) => {
    const applied = await appliedChecksums(client);
    verifyHistory(migrations, applied);
    return migrations.map((migration) => ({
      version: migration.version,
      name: migration.name,
      appliedAt: applied.get(migration.version)?.appliedAt ?? null,
    }));
  });
}
