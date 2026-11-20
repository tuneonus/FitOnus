import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  IMAGE_KEY_COLUMNS,
  LOOKS_LIKE_IMAGE_KEY_COLUMN,
} from '../../../src/shared/images/image-key-columns.js';
import { PUBLIC_IMAGE_FEATURES } from '../../../src/shared/images/image-policy.js';
import { createTestDatabase, type TestDatabase } from '../../helpers/test-database.js';

/**
 * The registry of image-key columns (src/shared/images/image-key-columns.ts) is the list a future orphan cleanup will
 * trust to know which objects in the public bucket are still referenced. If it is missing a column, such a cleanup
 * would delete an image something still shows. These tests compare it with the real schema, so adding an image column
 * without registering it fails here, in CI, long before any cleanup exists.
 */

interface ColumnRow {
  table_name: string;
  column_name: string;
}

/** Every column in the schema whose name says it holds a media object key, as `table.column`. */
async function imageKeyColumnsInSchema(pool: pg.Pool): Promise<string[]> {
  const { rows } = await pool.query<ColumnRow>(
    `SELECT c.table_name, c.column_name
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
      WHERE c.table_schema = 'public'`,
  );
  return rows
    .filter((row) => LOOKS_LIKE_IMAGE_KEY_COLUMN.test(row.column_name))
    .map((row) => `${row.table_name}.${row.column_name}`)
    .sort();
}

const registered = (): string[] => IMAGE_KEY_COLUMNS.map((c) => `${c.table}.${c.column}`).sort();

/** What the guard reports: columns that look like image keys in the schema but are not in the registry. */
async function unregisteredColumns(pool: pg.Pool): Promise<string[]> {
  const known = new Set(registered());
  return (await imageKeyColumnsInSchema(pool)).filter((name) => !known.has(name));
}

describe('the image-key registry matches the database schema', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase();
  }, 120_000);

  afterAll(async () => {
    await db?.drop();
  });

  it('knows every column in the schema that holds an image key (add new ones to IMAGE_KEY_COLUMNS)', async () => {
    expect(await unregisteredColumns(db.pool)).toEqual([]);
  });

  it('lists only columns that exist', async () => {
    const inSchema = new Set(await imageKeyColumnsInSchema(db.pool));
    for (const name of registered()) expect(inSchema.has(name), `${name} is not in the schema`).toBe(true);
  });

  it('describes each registered column as a nullable text column', async () => {
    for (const { table, column } of IMAGE_KEY_COLUMNS) {
      const { rows } = await db.pool.query<{
        data_type: string;
        is_nullable: string;
        column_default: string | null;
      }>(
        `SELECT data_type, is_nullable, column_default FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
        [table, column],
      );
      expect(rows[0], `${table}.${column}`).toEqual({
        data_type: 'text',
        is_nullable: 'YES',
        column_default: null,
      });
    }
  });

  it('has a CHECK on every registered column that pins its keys to the feature folder', async () => {
    for (const { table, column, feature } of IMAGE_KEY_COLUMNS) {
      const { rows } = await db.pool.query<{ def: string }>(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = $1::regclass AND contype = 'c'`,
        [table],
      );
      const pinning = rows.filter((r) => r.def.includes(column) && r.def.includes(`onusfit/${feature}/`));
      expect(pinning, `${table}.${column} has no CHECK limiting it to onusfit/${feature}/`).toHaveLength(1);
    }
  });

  it('has a registered column for every public image feature', () => {
    for (const feature of PUBLIC_IMAGE_FEATURES) {
      expect(
        IMAGE_KEY_COLUMNS.some((c) => c.feature === feature),
        feature,
      ).toBe(true);
    }
  });

  it('REJECTS an image column added without registering it (the guard itself works)', async () => {
    // Own database: the schema change must not leak into the other tests of this file.
    const probe = await createTestDatabase();
    try {
      expect(await unregisteredColumns(probe.pool)).toEqual([]);

      await probe.pool.query('ALTER TABLE exercises ADD COLUMN banner_image_key text');
      await probe.pool.query('ALTER TABLE challenges ADD COLUMN cover_key text');
      await probe.pool.query('ALTER TABLE users ADD COLUMN avatar_key text');
      expect(await unregisteredColumns(probe.pool)).toEqual([
        'challenges.cover_key',
        'exercises.banner_image_key',
        'users.avatar_key',
      ]);
    } finally {
      await probe.drop();
    }
  });

  it('does not mistake external-address columns for stored keys', async () => {
    const names = new Set(await imageKeyColumnsInSchema(db.pool));
    expect(names.has('exercises.image_url')).toBe(false);
    expect(names.has('exercises.video_url')).toBe(false);
  });
});
