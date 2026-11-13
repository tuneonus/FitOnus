import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type pg from 'pg';

/**
 * The numbered migration that creates `password_reset_tokens`. It is part of the regular migration set
 * (`createTestDatabase` already applies it); tests that need the SQL text itself read it from here.
 */
export const PENDING_PASSWORD_RESET_SQL = path.resolve(
  import.meta.dirname,
  '../../../../migrations/0016_create_password_reset_tokens.sql',
);

/**
 * Makes sure `password_reset_tokens` exists in a DISPOSABLE test database. The table is created by
 * migration 0016, so this is a no-op for databases made by `createTestDatabase`; it still falls back to
 * applying the SQL for a database migrated only up to 0015. Never call this with a pool that points at a
 * real database.
 */
export async function ensurePasswordResetSchema(
  pool: pg.Pool,
): Promise<'already-migrated' | 'applied-pending'> {
  const { rows } = await pool.query<{ present: boolean }>(
    `SELECT to_regclass('public.password_reset_tokens') IS NOT NULL AS present`,
  );
  if (rows[0]?.present) return 'already-migrated';
  await pool.query(await readFile(PENDING_PASSWORD_RESET_SQL, 'utf8'));
  return 'applied-pending';
}
