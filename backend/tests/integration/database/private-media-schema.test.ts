import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadMigrations, runMigrations } from '../../../src/database/migration-runner.js';
import { Database } from '../../../src/database/transaction.js';
import { PROGRESS_PHOTO_LIMIT } from '../../../src/modules/progress/domain/progress-photo.js';
import { PgPrivateMediaDeletionQueue } from '../../../src/shared/private-media/pg-deletion-queue.js';
import {
  newPrivateImageKey,
  privateThumbnailKey,
} from '../../../src/shared/private-media/private-image-policy.js';
import { MIGRATIONS_DIR, createTestDatabase, type TestDatabase } from '../../helpers/test-database.js';

let db: TestDatabase;
let queue: PgPrivateMediaDeletionQueue;
let counter = 0;

beforeAll(async () => {
  db = await createTestDatabase();
  queue = new PgPrivateMediaDeletionQueue(new Database(db.pool));
}, 180_000);

afterAll(async () => {
  await db?.drop();
});

async function user(pool: pg.Pool = db.pool): Promise<string> {
  counter += 1;
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, display_name, password_hash) VALUES ($1, 'Member', 'x') RETURNING id`,
    [`schema${counter}-${Date.now()}@example.test`],
  );
  return rows[0]!.id;
}

const insertAvatar = (userId: string, key: string) =>
  db.pool.query(
    `INSERT INTO member_avatars (user_id, object_key, width, height, byte_size) VALUES ($1, $2, 400, 400, 5000)
     ON CONFLICT (user_id) DO UPDATE SET object_key = EXCLUDED.object_key`,
    [userId, key],
  );

const insertPhoto = (
  userId: string,
  key: string = newPrivateImageKey(userId, 'progress'),
  takenOn = '2026-11-01',
) =>
  db.pool.query(
    `INSERT INTO progress_photos (user_id, object_key, taken_on, width, height, byte_size) VALUES ($1, $2, $3, 1200, 1600, 90000)`,
    [userId, key, takenOn],
  );

const queued = async (): Promise<string[]> =>
  (
    await db.pool.query<{ object_key: string }>(
      'SELECT object_key FROM private_media_deletions ORDER BY object_key',
    )
  ).rows.map((r) => r.object_key);

const clearQueue = () => db.pool.query('TRUNCATE private_media_deletions');

describe('member_avatars', () => {
  it("stores one picture per member and refuses a key that is not the member's own avatar key", async () => {
    const alice = await user();
    const bob = await user();
    await insertAvatar(alice, newPrivateImageKey(alice, 'avatar'));

    const refusals = [
      newPrivateImageKey(bob, 'avatar'), // someone else's id inside the key
      newPrivateImageKey(alice, 'progress'), // the wrong kind
      'onusfit/exercises/0123456789abcdef0123456789abcdef.webp', // a PUBLIC key
      `members/${alice}/avatar/0123456789abcdef0123456789abcdef.png`,
      `members/${alice}/avatar/0123456789abcdef0123456789abcdef.thumb.webp`,
      'https://example.com/me.webp',
    ];
    for (const key of refusals) {
      await expect(insertAvatar(alice, key), key).rejects.toMatchObject({
        constraint: 'member_avatars_object_key_valid',
      });
    }
  });

  it('does not let two members share one object', async () => {
    const a = await user();
    const b = await user();
    const key = newPrivateImageKey(a, 'avatar');
    await insertAvatar(a, key);
    await expect(insertAvatar(b, key)).rejects.toThrow(); // ownership CHECK (and UNIQUE) both refuse
  });

  it('queues the previous picture AND its thumbnail when it is replaced, and nothing when it is first set', async () => {
    const a = await user();
    await clearQueue();
    const first = newPrivateImageKey(a, 'avatar');
    await insertAvatar(a, first);
    expect(await queued()).toEqual([]);

    const second = newPrivateImageKey(a, 'avatar');
    await insertAvatar(a, second);
    expect(await queued()).toEqual([first, privateThumbnailKey(first)].sort());
  });

  it('does not queue anything when a row is updated without changing the key', async () => {
    const a = await user();
    await insertAvatar(a, newPrivateImageKey(a, 'avatar'));
    await clearQueue();
    await db.pool.query('UPDATE member_avatars SET width = 300, updated_at = now() WHERE user_id = $1', [a]);
    expect(await queued()).toEqual([]);
  });

  it('queues the picture and its thumbnail when the row is deleted', async () => {
    const a = await user();
    const key = newPrivateImageKey(a, 'avatar');
    await insertAvatar(a, key);
    await clearQueue();
    await db.pool.query('DELETE FROM member_avatars WHERE user_id = $1', [a]);
    expect(await queued()).toEqual([key, privateThumbnailKey(key)].sort());
  });
});

describe('progress_photos', () => {
  it("refuses a key that is not the member's own progress key, an unknown tag and an implausible date", async () => {
    const alice = await user();
    const bob = await user();
    await expect(insertPhoto(alice, newPrivateImageKey(bob, 'progress'))).rejects.toMatchObject({
      constraint: 'progress_photos_object_key_valid',
    });
    await expect(insertPhoto(alice, newPrivateImageKey(alice, 'avatar'))).rejects.toMatchObject({
      constraint: 'progress_photos_object_key_valid',
    });
    await expect(
      db.pool.query(
        `INSERT INTO progress_photos (user_id, object_key, taken_on, tag, width, height, byte_size) VALUES ($1, $2, '2026-01-01', 'selfie', 1, 1, 1)`,
        [alice, newPrivateImageKey(alice, 'progress')],
      ),
    ).rejects.toMatchObject({ constraint: 'progress_photos_tag_valid' });
    await expect(insertPhoto(alice, undefined, '1999-12-31')).rejects.toMatchObject({
      constraint: 'progress_photos_taken_on_sane',
    });
  });

  it(`holds at most ${PROGRESS_PHOTO_LIMIT} photos per member, whatever code inserts them`, async () => {
    const a = await user();
    for (let i = 0; i < PROGRESS_PHOTO_LIMIT; i += 1) await insertPhoto(a);
    await expect(insertPhoto(a)).rejects.toMatchObject({
      code: '23514',
      constraint: 'progress_photos_user_limit',
    });
    // Another member is unaffected, and deleting one makes room again.
    await insertPhoto(await user());
    await db.pool.query(
      'DELETE FROM progress_photos WHERE id = (SELECT id FROM progress_photos WHERE user_id = $1 LIMIT 1)',
      [a],
    );
    await insertPhoto(a);
  });

  it('keeps the limit when inserts race: exactly one of two concurrent inserts at 49 photos succeeds', async () => {
    const a = await user();
    for (let i = 0; i < PROGRESS_PHOTO_LIMIT - 1; i += 1) await insertPhoto(a);
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => insertPhoto(a)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(5);
    const { rows } = await db.pool.query<{ count: string }>(
      'SELECT count(*) FROM progress_photos WHERE user_id = $1',
      [a],
    );
    expect(Number(rows[0]!.count)).toBe(PROGRESS_PHOTO_LIMIT);
  });

  it('the number in the migration is the number in the code', async () => {
    const sql = await readFile(path.join(MIGRATIONS_DIR, '0027_create_progress_photos.sql'), 'utf8');
    expect(sql).toContain(`>= ${PROGRESS_PHOTO_LIMIT} THEN`);
    expect(sql).toContain(`at most ${PROGRESS_PHOTO_LIMIT} progress photos`);
  });

  it('queues the picture and its thumbnail when a photo is deleted', async () => {
    const a = await user();
    const key = newPrivateImageKey(a, 'progress');
    await insertPhoto(a, key);
    await clearQueue();
    await db.pool.query('DELETE FROM progress_photos WHERE user_id = $1', [a]);
    expect(await queued()).toEqual([key, privateThumbnailKey(key)].sort());
  });
});

describe('deleting an account', () => {
  it("queues every private object of that member (avatar and photos, picture and thumbnail) and no one else's", async () => {
    const leaving = await user();
    const staying = await user();
    const leavingKeys = [
      newPrivateImageKey(leaving, 'avatar'),
      ...Array.from({ length: 3 }, () => newPrivateImageKey(leaving, 'progress')),
    ];
    await insertAvatar(leaving, leavingKeys[0]!);
    for (const key of leavingKeys.slice(1)) await insertPhoto(leaving, key);
    const stayingKey = newPrivateImageKey(staying, 'avatar');
    await insertAvatar(staying, stayingKey);
    await insertPhoto(staying);
    await clearQueue();

    await db.pool.query('DELETE FROM users WHERE id = $1', [leaving]);

    const expected = leavingKeys.flatMap((key) => [key, privateThumbnailKey(key)]).sort();
    expect(await queued()).toEqual(expected);
    expect((await db.pool.query('SELECT 1 FROM member_avatars WHERE user_id = $1', [leaving])).rowCount).toBe(
      0,
    );
    expect(
      (await db.pool.query('SELECT 1 FROM progress_photos WHERE user_id = $1', [leaving])).rowCount,
    ).toBe(0);
    expect((await db.pool.query('SELECT 1 FROM member_avatars WHERE user_id = $1', [staying])).rowCount).toBe(
      1,
    );
  });

  it('queues in the same transaction: a rolled-back deletion queues nothing and removes nothing', async () => {
    const a = await user();
    await insertAvatar(a, newPrivateImageKey(a, 'avatar'));
    await insertPhoto(a);
    await clearQueue();

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM users WHERE id = $1', [a]);
      expect((await client.query('SELECT count(*) FROM private_media_deletions')).rows[0].count).toBe('4'); // visible inside
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    expect(await queued()).toEqual([]);
    expect((await db.pool.query('SELECT 1 FROM progress_photos WHERE user_id = $1', [a])).rowCount).toBe(1);
  });
});

describe('private_media_deletions', () => {
  it('can only ever name a private key, so it can never ask for public media to be deleted', async () => {
    for (const key of [
      'onusfit/exercises/0123456789abcdef0123456789abcdef.webp',
      'onusfit/notifications/0123456789abcdef0123456789abcdef.webp',
      'notifications/0123456789abcdef0123456789abcdef.png',
      'members/not-a-uuid/avatar/0123456789abcdef0123456789abcdef.webp',
      '',
    ]) {
      await expect(
        db.pool.query('INSERT INTO private_media_deletions (object_key) VALUES ($1)', [key]),
        key,
      ).rejects.toMatchObject({
        constraint: 'private_media_deletions_key_valid',
      });
    }
  });

  it('is not tied to the account: the row outlives the user whose photo it was', async () => {
    const a = await user();
    const key = newPrivateImageKey(a, 'avatar');
    await insertAvatar(a, key);
    await clearQueue();
    await db.pool.query('DELETE FROM users WHERE id = $1', [a]);
    expect((await queued()).length).toBe(2);
  });
});

describe('PgPrivateMediaDeletionQueue', () => {
  const owner = '3f2b8c1e-7d4a-4b6e-9a10-5c2d8e7f6a01';
  const keys = (n: number) => Array.from({ length: n }, () => newPrivateImageKey(owner, 'progress'));

  it('queues idempotently and refuses anything that is not a private key', async () => {
    await clearQueue();
    const [a] = keys(1);
    await queue.enqueue([a!, a!]);
    await queue.enqueue([a!]);
    expect(await queued()).toEqual([a]);
    await expect(queue.enqueue(['onusfit/exercises/0123456789abcdef0123456789abcdef.webp'])).rejects.toThrow(
      /not a private key/,
    );
    await expect(queue.enqueue([])).resolves.toBeUndefined();
  });

  it('hands out due keys once: a claimed key is hidden from other workers until its lease ends', async () => {
    await clearQueue();
    await queue.enqueue(keys(4));
    const first = await queue.claimDue(3, 120);
    expect(first).toHaveLength(3);
    const second = await queue.claimDue(3, 120);
    expect(second).toHaveLength(1);
    expect(new Set([...first, ...second]).size).toBe(4);
    expect(await queue.claimDue(10, 120)).toEqual([]);

    // The lease runs out (the worker that took them died): they become due again.
    await db.pool.query(`UPDATE private_media_deletions SET next_attempt_at = now() - interval '1 second'`);
    expect(await queue.claimDue(10, 120)).toHaveLength(4);
  });

  it('gives two workers claiming at the same moment disjoint sets', async () => {
    await clearQueue();
    await queue.enqueue(keys(40));
    const [a, b, c] = await Promise.all([
      queue.claimDue(20, 120),
      queue.claimDue(20, 120),
      queue.claimDue(20, 120),
    ]);
    const all = [...a, ...b, ...c];
    expect(all.length).toBe(40);
    expect(new Set(all).size).toBe(40); // no key claimed twice
  });

  it('completes a key by removing it', async () => {
    await clearQueue();
    const [k] = keys(1);
    await queue.enqueue([k!]);
    await queue.complete(k!);
    expect(await queued()).toEqual([]);
    expect(await queue.pendingCount()).toBe(0);
  });

  it('retries a failed key later with growing backoff (30 s, 60 s, 120 s ... capped at 6 h) and a coarse reason', async () => {
    await clearQueue();
    const [k] = keys(1);
    await queue.enqueue([k!]);
    const waits: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      await queue.fail(k!, 'Private storage delete failed (http HTTP 503)');
      const { rows } = await db.pool.query<{ attempts: number; secs: number; last_error: string }>(
        `SELECT attempts, extract(epoch FROM (next_attempt_at - now()))::float AS secs, last_error FROM private_media_deletions WHERE object_key = $1`,
        [k],
      );
      expect(rows[0]!.attempts).toBe(i + 1);
      expect(rows[0]!.last_error).toBe('Private storage delete failed (http HTTP 503)');
      waits.push(Math.round(rows[0]!.secs));
      // A failed key is not due again straight away.
      expect(await queue.claimDue(10, 1)).toEqual([]);
      await db.pool.query(
        `UPDATE private_media_deletions SET next_attempt_at = now() WHERE object_key = $1`,
        [k],
      );
    }
    expect(waits[0]).toBeGreaterThanOrEqual(28);
    expect(waits[0]).toBeLessThanOrEqual(30);
    expect(waits[1]).toBeGreaterThanOrEqual(58);
    expect(waits[1]).toBeLessThanOrEqual(60);
    expect(waits[2]).toBeGreaterThanOrEqual(118);
    expect(waits[2]).toBeLessThanOrEqual(120);

    await db.pool.query(`UPDATE private_media_deletions SET attempts = 40 WHERE object_key = $1`, [k]);
    await queue.fail(k!, 'again');
    const { rows } = await db.pool.query<{ secs: number }>(
      `SELECT extract(epoch FROM (next_attempt_at - now()))::float AS secs FROM private_media_deletions WHERE object_key = $1`,
      [k],
    );
    expect(Math.round(rows[0]!.secs)).toBeLessThanOrEqual(21_600);
    expect(Math.round(rows[0]!.secs)).toBeGreaterThan(21_000);
  });

  it('truncates a long reason to what the table allows instead of failing', async () => {
    await clearQueue();
    const [k] = keys(1);
    await queue.enqueue([k!]);
    await queue.fail(k!, 'x'.repeat(5_000));
    const { rows } = await db.pool.query<{ len: number }>(
      'SELECT char_length(last_error) AS len FROM private_media_deletions',
    );
    expect(rows[0]!.len).toBe(200);
  });
});

describe('upgrading a database that already holds members', () => {
  it('adds the member-photo tables without touching a single existing user, session or workout', async () => {
    const before = await mkdtemp(path.join(os.tmpdir(), 'migrations-before-'));
    const upgrade = await createTestDatabase({ migrate: false });
    try {
      // The schema as it was before this feature: everything up to 0024.
      const all = await loadMigrations(MIGRATIONS_DIR);
      for (const migration of all.filter((m) => m.version <= 24)) {
        await cp(path.join(MIGRATIONS_DIR, migration.filename), path.join(before, migration.filename));
      }
      await runMigrations({ pool: upgrade.pool, directory: before });

      const ids: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        const { rows } = await upgrade.pool.query<{ id: string }>(
          `INSERT INTO users (email, display_name, password_hash, role) VALUES ($1, $2, 'hash', 'member') RETURNING id`,
          [`old${i}@example.test`, `Old ${i}`],
        );
        ids.push(rows[0]!.id);
      }
      const snapshot = async () =>
        (await upgrade.pool.query('SELECT * FROM users ORDER BY id')).rows.map((row) => JSON.stringify(row));
      const usersBefore = await snapshot();
      const tablesBefore = (
        await upgrade.pool.query<{ table_name: string }>(
          `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
        )
      ).rows.map((r) => r.table_name);
      expect(tablesBefore).not.toContain('progress_photos');

      const result = await runMigrations({ pool: upgrade.pool, directory: MIGRATIONS_DIR });
      expect(result.applied).toEqual(
        expect.arrayContaining([
          '0025_create_private_media_deletions.sql',
          '0026_create_member_avatars.sql',
          '0027_create_progress_photos.sql',
        ]),
      );

      expect(await snapshot()).toEqual(usersBefore); // not one byte of an existing member changed
      const tablesAfter = (
        await upgrade.pool.query<{ table_name: string }>(
          `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
        )
      ).rows.map((r) => r.table_name);
      expect(tablesAfter).toEqual(
        expect.arrayContaining([
          ...tablesBefore,
          'member_avatars',
          'progress_photos',
          'private_media_deletions',
        ]),
      );
      // Existing members simply have no avatar and no photos yet.
      expect((await upgrade.pool.query('SELECT count(*) FROM member_avatars')).rows[0].count).toBe('0');
      expect((await upgrade.pool.query('SELECT count(*) FROM progress_photos')).rows[0].count).toBe('0');
      expect(ids).toHaveLength(3);
    } finally {
      await rm(before, { recursive: true, force: true });
      await upgrade.drop();
    }
  }, 180_000);

  it('adds no column to users', async () => {
    const { rows } = await db.pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position`,
    );
    expect(rows.map((r) => r.column_name)).toEqual([
      'id',
      'email',
      'display_name',
      'password_hash',
      'role',
      'status',
      'version',
      'created_at',
      'updated_at',
      'disabled_at',
    ]);
  });
});
