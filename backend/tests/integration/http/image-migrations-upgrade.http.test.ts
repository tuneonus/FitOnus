import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.js';
import { loadConfig } from '../../../src/config/env.js';
import { createContainer, type Container } from '../../../src/container.js';
import { loadMigrations, runMigrations } from '../../../src/database/migration-runner.js';
import { createLogger } from '../../../src/shared/logging/logger.js';
import { realPng } from '../../helpers/images.js';
import { FakeImageStore, FakeSender } from '../../helpers/notification-fakes.js';
import { login, seedUser, TEST_ENV, type LoggedIn, type SeededUser } from '../../helpers/test-app.js';
import { createTestDatabase, MIGRATIONS_DIR, type TestDatabase } from '../../helpers/test-database.js';

/**
 * Three migrations are involved, and they are applied one after the other on a database that already has data:
 *
 *   0021  adds notification_campaigns.image_key (nullable) with a CHECK that allows only the legacy key shape
 *         notifications/<hex>.jpg|png
 *   0022  widens that CHECK to also allow the canonical shape onusfit/notifications/<hex>.webp
 *   0023  adds exercises.image_key (nullable) with a CHECK for onusfit/exercises/<hex>.webp
 *
 * The real-world failure this guards against: the new code is running before the schema has caught up.
 *
 *   before 0021:  GET  /admin/notifications -> 500 ZodError (imageKey undefined); POST/PATCH -> 500 (PG 42703)
 *   after 0021 only: uploads work but saving a notification with the new key shape is refused by the CHECK
 *   after 0022:   everything works for notifications, for old ones without an image, with a legacy image, and new ones
 *   before 0023:  exercises can be READ (an exercise shows its image_url exactly as before) but saving one fails,
 *                 because the write names the new column: this is why the deployment order is migrate first
 *   after 0023:   uploaded exercise images work, and every exercise that already existed is untouched
 *
 * Exercises are written BEFORE any of the three migrations and compared, row by row down to the PostgreSQL
 * transaction id, after each of them: none of the migrations may rewrite or alter a single existing exercise.
 * Each stage is pinned down on the SAME running app, so what the app does while the schema lags, and that the next
 * migration repairs it without touching a single existing row, are both proven.
 */

const IMAGE_MIGRATION = 21;
const WEBP_KEY_MIGRATION = 22;
const EXERCISE_IMAGE_MIGRATION = 23;
const ORIGIN = 'https://media.example.test';
const R2_ENV = {
  R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
  R2_ACCESS_KEY_ID: 'TESTACCESSKEYID000000',
  R2_SECRET_ACCESS_KEY: 'TEST-SECRET-ACCESS-KEY-THAT-MUST-NEVER-LEAK',
  R2_BUCKET: 'fitonus-media',
  R2_PUBLIC_BASE_URL: ORIGIN,
};
const NOTIFICATIONS = '/api/v1/admin/notifications';
const ADMIN_EXERCISES = '/api/v1/admin/workouts/exercises';
const MEMBER_EXERCISES = '/api/v1/workouts/exercises';
const EXTERNAL = 'https://cdn.example.com/legacy-press.jpg';
const EXERCISE_KEY_PATTERN = /^onusfit\/exercises\/[0-9a-f]{32}\.webp$/;
const LEGACY_KEY = 'notifications/0123456789abcdef0123456789abcdef.png';
const HEX = 'fedcba9876543210fedcba9876543210';
const pushKeyOf = (key: string): string => key.replace(/\.webp$/, '.push.jpg');

const plainDraft = (member: SeededUser, extra: Record<string, unknown> = {}) => ({
  title: 'Plain draft',
  body: 'No image anywhere',
  category: 'announcements',
  destination: null,
  audience: { type: 'users', userIds: [member.id] },
  mode: 'draft',
  ...extra,
});

describe('images across migrations 0021, 0022 and 0023 (code ahead of the schema, then migrated step by step)', () => {
  let db: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let container: Container;
  const dirs: string[] = [];
  let upToPrevious: string;
  let upToImageColumn: string;
  let upToWebpKey: string;
  let upToExerciseImage: string;
  let adminUser: SeededUser;
  let admin: LoggedIn;
  let member: SeededUser;
  let memberAuth: LoggedIn;
  let png: Buffer;
  const sender = new FakeSender();
  const store = new FakeImageStore();
  let legacyIds: { draft: string; sent: string; partial: string; due: string };
  /** A draft saved while only 0021 was applied, holding a legacy-shaped image key. */
  let legacyImageDraftId: string;
  /** Exercises written before any of the three migrations, and a snapshot of them to compare against. */
  let legacyExercise: { system: string; custom: string; deleted: string; plain: string; unsafe: string };
  let exercisesBefore: Record<string, unknown>[];

  const api = () => request(app);
  const adminAuth = (): LoggedIn => admin;
  const sql = <R extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ) => db.pool.query<R>(text, values);
  const columnExists = async () =>
    (
      await sql(
        "SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_campaigns' AND column_name = 'image_key'",
      )
    ).rows.length === 1;
  const checkDefinition = async () =>
    (
      await sql<{ def: string }>(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conname = 'notification_campaigns_image_key_valid' AND conrelid = 'notification_campaigns'::regclass`,
      )
    ).rows[0]?.def;
  const statusOf = async (id: string) =>
    (await sql<{ status: string }>('SELECT status FROM notification_campaigns WHERE id = $1', [id])).rows[0]!
      .status;
  const exerciseColumnExists = async () =>
    (
      await sql(
        "SELECT 1 FROM information_schema.columns WHERE table_name = 'exercises' AND column_name = 'image_key'",
      )
    ).rows.length === 1;
  const exerciseCheckDefinition = async () =>
    (
      await sql<{ def: string }>(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conname = 'exercises_image_key_valid' AND conrelid = 'exercises'::regclass`,
      )
    ).rows[0]?.def;
  /** Every existing exercise, down to the transaction that wrote it: equal snapshots mean a row was not rewritten. */
  const exerciseSnapshot = async () =>
    (
      await sql(
        `SELECT id, name, image_url, video_url, is_system, created_by, created_at, updated_at, deleted_at, xmin::text AS xmin
           FROM exercises ORDER BY id`,
      )
    ).rows;
  const maxVersion = async () =>
    (await sql<{ max: number }>('SELECT max(version)::int AS max FROM schema_migrations')).rows[0]!.max;
  const dispatchUntilDone = async (id: string) => {
    for (let i = 0; i < 6 && !['sent', 'partially_failed', 'failed'].includes(await statusOf(id)); i += 1) {
      await container.notifications!.dispatcher!.runOnce();
    }
  };
  /** Tries to store a key directly in the table, bypassing the application, to see what the database itself allows. */
  const insertWithKey = (key: string) =>
    sql(
      `INSERT INTO notification_campaigns
         (created_by, title, body, category, destination, audience_type, audience_user_ids, status, image_key)
       VALUES ($1, 'Direct insert', 'Direct insert', 'announcements', 'home', 'users', ARRAY[$2]::uuid[], 'draft', $3)`,
      [adminUser.id, member.id, key],
    );
  /** A directory holding only the migrations up to and including `version`, for stopping the schema part way. */
  const migrationsUpTo = async (version: number, prefix: string) => {
    const dir = await mkdtemp(path.join(tmpdir(), prefix));
    dirs.push(dir);
    for (const migration of (await loadMigrations(MIGRATIONS_DIR)).filter((m) => m.version <= version)) {
      await writeFile(path.join(dir, migration.filename), migration.sql);
    }
    return dir;
  };

  beforeAll(async () => {
    png = await realPng({ width: 640, height: 360 });
    // A database exactly as it is before this feature: migrations 0001..0020 only.
    db = await createTestDatabase({ migrate: false });
    upToPrevious = await migrationsUpTo(IMAGE_MIGRATION - 1, 'migrations-before-0021-');
    upToImageColumn = await migrationsUpTo(IMAGE_MIGRATION, 'migrations-through-0021-');
    upToWebpKey = await migrationsUpTo(WEBP_KEY_MIGRATION, 'migrations-through-0022-');
    // Stage 4 stops at 0023: later migrations (the workout cover, 0024) have their own upgrade test.
    upToExerciseImage = await migrationsUpTo(EXERCISE_IMAGE_MIGRATION, 'migrations-through-0023-');
    await runMigrations({ pool: db.pool, directory: upToPrevious });

    adminUser = await seedUser(db.pool, { role: 'admin' });
    member = await seedUser(db.pool);

    // Campaigns that already exist in the database, written the way the old code wrote them (no image column).
    const insert = async (
      title: string,
      status: string,
      options: { finished?: boolean; due?: boolean } = {},
    ) =>
      (
        await sql<{ id: string }>(
          `INSERT INTO notification_campaigns
             (created_by, title, body, category, destination, audience_type, audience_user_ids, status, completed_at, scheduled_at)
           VALUES ($1, $2, 'Written before images existed', 'announcements', 'home', 'users', ARRAY[$3]::uuid[], $4,
                   CASE WHEN $5::boolean THEN now() END,
                   CASE WHEN $6::boolean THEN now() - interval '1 minute' END)
           RETURNING id`,
          [adminUser.id, title, member.id, status, options.finished === true, options.due === true],
        )
      ).rows[0]!.id;
    legacyIds = {
      draft: await insert('Legacy draft', 'draft'),
      sent: await insert('Legacy sent', 'sent', { finished: true }),
      partial: await insert('Legacy partially failed', 'partially_failed', { finished: true }),
      // Due right now: the dispatcher will try to send this one.
      due: await insert('Legacy due', 'scheduled', { due: true }),
    };
    await sql(
      `INSERT INTO user_push_devices (user_id, installation_id, push_token, platform)
       VALUES ($1, 'legacy-install-1', $2, 'android')`,
      [member.id, 'fcm_legacy_device_'.padEnd(40, 'x')],
    );

    // Exercises that already exist, written the way every exercise was written before uploads existed (no image_key
    // column), covering the shapes real data has: a system exercise with both addresses, a custom one, a soft-deleted
    // one, one with no image at all, and one whose address is not http(s) (saved before that rule existed).
    const insertExercise = async (
      name: string,
      options: {
        imageUrl?: string | null;
        videoUrl?: string | null;
        system?: boolean;
        deleted?: boolean;
      } = {},
    ) =>
      (
        await sql<{ id: string }>(
          `INSERT INTO exercises (name, primary_muscles, equipment, category, difficulty, image_url, video_url, is_system, created_by, deleted_at)
           VALUES ($1, ARRAY['chest'], 'barbell', 'strength', 'beginner', $2, $3, $4, $5, CASE WHEN $6::boolean THEN now() END)
           RETURNING id`,
          [
            name,
            options.imageUrl ?? null,
            options.videoUrl ?? null,
            options.system !== false,
            options.system === false ? adminUser.id : null,
            options.deleted === true,
          ],
        )
      ).rows[0]!.id;
    legacyExercise = {
      system: await insertExercise('Legacy press', {
        imageUrl: EXTERNAL,
        videoUrl: 'https://youtu.be/legacy',
      }),
      custom: await insertExercise('Legacy custom', {
        imageUrl: 'http://cdn.example.com/custom.jpg',
        system: false,
      }),
      deleted: await insertExercise('Legacy deleted', { imageUrl: EXTERNAL, deleted: true }),
      plain: await insertExercise('Legacy plain'),
      unsafe: await insertExercise('Legacy unsafe', {
        imageUrl: 'javascript:alert(1)',
        videoUrl: 'data:text/html;base64,AAAA',
      }),
    };
    exercisesBefore = await exerciseSnapshot();

    const config = loadConfig({ ...TEST_ENV, ...R2_ENV, DATABASE_URL: db.url });
    container = createContainer(config, db.pool, undefined, { pushSender: sender, imageStore: store });
    app = createApp({ config, logger: createLogger({ level: 'silent', pretty: false }), container });
    admin = await login(app, adminUser);
    memberAuth = await login(app, member);
  }, 180_000);

  afterAll(async () => {
    for (const dir of dirs) await rm(dir, { recursive: true, force: true });
    await db?.drop();
  });

  // ---------------------------------------------------------------------------------------------
  describe('stage 1: the schema is still behind (migrations 0001..0020, image_key column missing)', () => {
    it('is the situation under test: the column is absent and every earlier migration is applied', async () => {
      expect(await columnExists()).toBe(false);
      expect(await maxVersion()).toBe(IMAGE_MIGRATION - 1);
    });

    it('GET list answers 200 with every existing campaign shown as having no image (was: 500 ZodError)', async () => {
      const res = await api().get(NOTIFICATIONS).set(admin.auth);
      expect(res.status).toBe(200);
      const rows = res.body.data as { id: string; imageKey: string | null; imageUrl: string | null }[];
      expect(rows).toHaveLength(4);
      for (const row of rows) {
        expect(row.imageKey).toBeNull();
        expect(row.imageUrl).toBeNull();
      }
    });

    it('GET one campaign answers 200 too', async () => {
      const res = await api().get(`${NOTIFICATIONS}/${legacyIds.sent}`).set(admin.auth);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ title: 'Legacy sent', imageKey: null, imageUrl: null });
    });

    it('POST of a plain text draft fails (was: 500 PostgreSQL 42703), says nothing about why, and stores nothing', async () => {
      const res = await api().post(NOTIFICATIONS).set(admin.auth).send(plainDraft(member));
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
      const text = JSON.stringify(res.body);
      for (const leak of ['image_key', 'column', 'notification_campaigns', '42703', 'does not exist']) {
        expect(text).not.toContain(leak);
      }
      expect((await sql('SELECT 1 FROM notification_campaigns')).rows).toHaveLength(4);
    });

    it('editing an existing draft fails the same way and leaves it unchanged', async () => {
      const res = await api()
        .patch(`${NOTIFICATIONS}/${legacyIds.draft}`)
        .set(admin.auth)
        .send({
          ...plainDraft(member, { title: 'Edited', body: 'Edited body' }),
          mode: undefined,
          version: 1,
        });
      expect(res.status).toBe(500);
      const { rows } = await sql<{ title: string; version: number }>(
        'SELECT title, version FROM notification_campaigns WHERE id = $1',
        [legacyIds.draft],
      );
      expect(rows[0]).toEqual({ title: 'Legacy draft', version: 1 });
    });

    it('the dispatcher sends nothing, does not throw, and does not lose or fail the due campaign', async () => {
      await expect(container.notifications!.dispatcher!.runOnce()).resolves.toBeDefined();
      expect(sender.sent).toHaveLength(0);
      // Neither finished nor failed: it is waiting to be picked up again once the schema is right.
      expect(['scheduled', 'sending']).toContain(await statusOf(legacyIds.due));
    });

    it('exercises can still be READ while exercises.image_key is missing: each shows the address it was stored with', async () => {
      expect(await exerciseColumnExists()).toBe(false);
      const list = await api().get(MEMBER_EXERCISES).set(memberAuth.auth);
      expect(list.status).toBe(200);
      const byId = new Map(
        (list.body.data as { id: string; imageUrl: string | null }[]).map((exercise) => [
          exercise.id,
          exercise,
        ]),
      );
      expect(byId.get(legacyExercise.system)).toMatchObject({
        imageUrl: EXTERNAL,
        imageKey: null,
        externalImageUrl: EXTERNAL,
        videoUrl: 'https://youtu.be/legacy',
      });
      expect(byId.get(legacyExercise.custom)).toMatchObject({
        imageUrl: 'http://cdn.example.com/custom.jpg',
      });
      expect(byId.get(legacyExercise.plain)).toMatchObject({ imageUrl: null, imageKey: null });
      // A value that is not http(s) (saved before the rule existed) is never passed on to an app.
      expect(byId.get(legacyExercise.unsafe)).toMatchObject({
        imageUrl: null,
        externalImageUrl: null,
        videoUrl: null,
      });
      expect(byId.has(legacyExercise.deleted)).toBe(false);

      const admin = await api().get(ADMIN_EXERCISES).set(adminAuth().auth);
      expect(admin.status).toBe(200);
    });

    it('saving an exercise fails while the column is missing (so: migrate first), says nothing about why, and changes nothing', async () => {
      const created = await api()
        .post(ADMIN_EXERCISES)
        .set(adminAuth().auth)
        .send({
          name: 'New squat',
          instructions: ['Stand'],
          primaryMuscles: ['quads'],
          equipment: 'barbell',
          category: 'strength',
          difficulty: 'beginner',
        });
      expect(created.status).toBe(500);
      expect(created.body.error.code).toBe('INTERNAL_ERROR');
      const edited = await api()
        .put(`${ADMIN_EXERCISES}/${legacyExercise.system}`)
        .set(adminAuth().auth)
        .send({ name: 'Edited' });
      expect(edited.status).toBe(500);
      for (const response of [created, edited]) {
        const text = JSON.stringify(response.body);
        for (const leak of ['image_key', 'column', 'exercises', '42703', 'does not exist'])
          expect(text).not.toContain(leak);
      }
      expect(await exerciseSnapshot()).toEqual(exercisesBefore);
    });

    it('an upload works (it needs no table), but saving the new key on an exercise fails the same way', async () => {
      const uploaded = await api()
        .post(`${ADMIN_EXERCISES}/images`)
        .set(adminAuth().auth)
        .set('Content-Type', 'image/png')
        .send(png);
      expect(uploaded.status).toBe(201);
      expect(uploaded.body.data.imageKey).toMatch(EXERCISE_KEY_PATTERN);
      const attached = await api()
        .put(`${ADMIN_EXERCISES}/${legacyExercise.system}`)
        .set(adminAuth().auth)
        .send({ imageKey: uploaded.body.data.imageKey });
      expect(attached.status).toBe(500);
      expect(await exerciseSnapshot()).toEqual(exercisesBefore);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('stage 2: migration 0021 alone is applied (the column exists, the CHECK allows only legacy keys)', () => {
    it('applies exactly one migration and finds the history of 0001..0020 intact (checksums verified)', async () => {
      const { applied } = await runMigrations({ pool: db.pool, directory: upToImageColumn });
      expect(applied).toEqual(['0021_add_notification_campaign_image.sql']);
      expect(await columnExists()).toBe(true);
      expect(await maxVersion()).toBe(IMAGE_MIGRATION);
    });

    it('is a no-op the second time', async () => {
      expect((await runMigrations({ pool: db.pool, directory: upToImageColumn })).applied).toEqual([]);
    });

    it('left every exercise exactly as it was (0021 is about notifications)', async () => {
      expect(await exerciseColumnExists()).toBe(false);
      expect(await exerciseSnapshot()).toEqual(exercisesBefore);
    });

    it('left every existing campaign with image_key NULL, and the column is nullable', async () => {
      const { rows } = await sql<{ n: number }>(
        'SELECT count(*)::int AS n FROM notification_campaigns WHERE image_key IS NULL',
      );
      expect(rows[0]!.n).toBe(4);
      const col = await sql<{ is_nullable: string }>(
        "SELECT is_nullable FROM information_schema.columns WHERE table_name = 'notification_campaigns' AND column_name = 'image_key'",
      );
      expect(col.rows[0]!.is_nullable).toBe('YES');
    });

    it('the CHECK still pins the legacy shape only: the database refuses the canonical key until 0022', async () => {
      expect(await checkDefinition()).not.toContain('onusfit');
      await expect(insertWithKey(`onusfit/notifications/${HEX}.webp`)).rejects.toMatchObject({
        code: '23514',
      });
      await expect(insertWithKey(LEGACY_KEY)).resolves.toBeDefined();
      await sql("DELETE FROM notification_campaigns WHERE title = 'Direct insert'");
    });

    it('GET list still answers 200 with the same campaigns, none having an image', async () => {
      const res = await api().get(NOTIFICATIONS).set(admin.auth);
      expect(res.status).toBe(200);
      expect((res.body.data as { imageKey: unknown }[]).map((c) => c.imageKey)).toEqual([
        null,
        null,
        null,
        null,
      ]);
    });

    it('POST of a plain text draft now works and has no image', async () => {
      const res = await api().post(NOTIFICATIONS).set(admin.auth).send(plainDraft(member));
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ imageKey: null, imageUrl: null });
    });

    it('an existing draft can be edited, and still has no image', async () => {
      const res = await api()
        .patch(`${NOTIFICATIONS}/${legacyIds.draft}`)
        .set(admin.auth)
        .send({
          ...plainDraft(member, { title: 'Edited legacy draft', body: 'Edited body' }),
          mode: undefined,
          version: 1,
        });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        title: 'Edited legacy draft',
        version: 2,
        imageKey: null,
        imageUrl: null,
      });
    });

    it('the campaign the dispatcher could not send earlier is now sent exactly once, as plain text', async () => {
      await dispatchUntilDone(legacyIds.due);
      expect(await statusOf(legacyIds.due)).toBe('sent');
      expect(sender.sent).toHaveLength(1);
      expect(sender.sent[0]!.title).toBe('Legacy due');
      expect(sender.sent[0]).not.toHaveProperty('imageUrl');
      await container.notifications!.dispatcher!.runOnce();
      expect(sender.sent).toHaveLength(1); // nothing re-sent
    });

    it('a draft with a legacy-shaped image key can be saved', async () => {
      const res = await api()
        .post(NOTIFICATIONS)
        .set(admin.auth)
        .send(plainDraft(member, { title: 'Legacy picture', imageKey: LEGACY_KEY }));
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ imageKey: LEGACY_KEY, imageUrl: `${ORIGIN}/${LEGACY_KEY}` });
      legacyImageDraftId = res.body.data.id as string;
    });

    it('an upload works (it needs no table), but saving the new key shape is refused without leaking why', async () => {
      const uploaded = await api()
        .post(`${NOTIFICATIONS}/images`)
        .set(admin.auth)
        .set('Content-Type', 'image/png')
        .send(png);
      expect(uploaded.status).toBe(201);
      const { imageKey } = uploaded.body.data as { imageKey: string };
      expect(imageKey).toMatch(/^onusfit\/notifications\/[0-9a-f]{32}\.webp$/);

      const res = await api()
        .post(NOTIFICATIONS)
        .set(admin.auth)
        .send(plainDraft(member, { title: 'New picture', imageKey }));
      // The CHECK violation (SQLSTATE 23514) reaches the generic database-error mapping: a 409 that names no table,
      // column or constraint. Nothing is saved; applying 0022 is what makes this request succeed.
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
      const text = JSON.stringify(res.body);
      for (const leak of [
        'notification_campaigns_image_key_valid',
        'notification_campaigns',
        'image_key',
        '23514',
        'check constraint',
      ]) {
        expect(text).not.toContain(leak);
      }
      expect(
        (await sql("SELECT 1 FROM notification_campaigns WHERE title = 'New picture'")).rows,
      ).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('stage 3: migration 0022 is applied to the same running app', () => {
    let rowsBefore: Record<string, unknown>[];

    it('applies exactly one migration, 0022, with the history of 0001..0021 intact (checksums verified)', async () => {
      rowsBefore = (
        await sql(
          'SELECT id, image_key, version, updated_at, xmin::text AS xmin FROM notification_campaigns ORDER BY id',
        )
      ).rows;
      expect(rowsBefore.length).toBeGreaterThan(4);

      const { applied } = await runMigrations({ pool: db.pool, directory: upToWebpKey });
      expect(applied).toEqual(['0022_allow_webp_notification_image_keys.sql']);
      expect(await maxVersion()).toBe(WEBP_KEY_MIGRATION);
    });

    it('is a no-op the second time', async () => {
      expect((await runMigrations({ pool: db.pool, directory: upToWebpKey })).applied).toEqual([]);
    });

    it('left every exercise exactly as it was, and exercises still wait for 0023 (the column is not here yet)', async () => {
      expect(await exerciseColumnExists()).toBe(false);
      expect(await exerciseSnapshot()).toEqual(exercisesBefore);
      const edited = await api()
        .put(`${ADMIN_EXERCISES}/${legacyExercise.system}`)
        .set(adminAuth().auth)
        .send({ name: 'Edited' });
      expect(edited.status).toBe(500);
    });

    it('rewrote no row: every campaign (and every stored key) is byte for byte what it was', async () => {
      const after = (
        await sql(
          'SELECT id, image_key, version, updated_at, xmin::text AS xmin FROM notification_campaigns ORDER BY id',
        )
      ).rows;
      expect(after).toEqual(rowsBefore);
      expect(after.filter((row) => row.image_key === LEGACY_KEY)).toHaveLength(1);
    });

    it('keeps exactly one CHECK, and it names both key shapes', async () => {
      const def = (await checkDefinition()) ?? '';
      expect(def).toContain('onusfit/notifications');
      expect(def).toContain('notifications/');
      const { rows } = await sql(
        `SELECT 1 FROM pg_constraint WHERE conrelid = 'notification_campaigns'::regclass AND conname LIKE 'notification_campaigns_image_key%'`,
      );
      expect(rows).toHaveLength(1);
    });

    it('the database now accepts the legacy and the canonical shape, and nothing else', async () => {
      await expect(insertWithKey(LEGACY_KEY)).resolves.toBeDefined();
      await expect(insertWithKey(`notifications/${HEX}.jpg`)).resolves.toBeDefined();
      await expect(insertWithKey(`onusfit/notifications/${HEX}.webp`)).resolves.toBeDefined();
      await sql("DELETE FROM notification_campaigns WHERE title = 'Direct insert'");

      for (const bad of [
        `https://media.example.test/onusfit/notifications/${HEX}.webp`,
        `//evil.example/onusfit/notifications/${HEX}.webp`,
        `onusfit/notifications/../exercises/${HEX}.webp`,
        `onusfit/notifications/${HEX}.push.jpg`,
        `onusfit/notifications/${HEX}.png`,
        `onusfit/exercises/${HEX}.webp`,
        `onusfit/notifications/${HEX.toUpperCase()}.webp`,
        `onusfit/notifications/${HEX.slice(1)}.webp`,
        `notifications/${HEX}.webp`,
        `notifications/${HEX}.gif`,
        `/onusfit/notifications/${HEX}.webp`,
        `onusfit/notifications/${HEX}.webp\n`,
        `onusfit/notifications/${HEX}.webp?x=1`,
        '',
      ]) {
        await expect(insertWithKey(bad), JSON.stringify(bad)).rejects.toMatchObject({ code: '23514' });
      }
      expect(
        (await sql("SELECT 1 FROM notification_campaigns WHERE title = 'Direct insert'")).rows,
      ).toHaveLength(0);
    });

    it('GET list answers 200; the old campaigns are untouched and the legacy image draft shows its original URL', async () => {
      const res = await api().get(`${NOTIFICATIONS}?limit=50`).set(admin.auth);
      expect(res.status).toBe(200);
      const byTitle = new Map(
        (res.body.data as { title: string; imageKey: string | null; imageUrl: string | null }[]).map((c) => [
          c.title,
          c,
        ]),
      );
      for (const title of [
        'Legacy sent',
        'Legacy partially failed',
        'Legacy due',
        'Plain draft',
        'Edited legacy draft',
      ]) {
        expect(byTitle.get(title), title).toMatchObject({ imageKey: null, imageUrl: null });
      }
      expect(byTitle.get('Legacy picture')).toMatchObject({
        imageKey: LEGACY_KEY,
        imageUrl: `${ORIGIN}/${LEGACY_KEY}`,
      });
    });

    it('the saved legacy-keyed draft is sent with its ORIGINAL image URL, unchanged by the new policy', async () => {
      store.objects.set(LEGACY_KEY, { body: png, contentType: 'image/png', cacheControl: undefined });
      const send = await api().post(`${NOTIFICATIONS}/${legacyImageDraftId}/send`).set(admin.auth).send({});
      expect(send.status).toBeLessThan(300);
      await dispatchUntilDone(legacyImageDraftId);
      expect(await statusOf(legacyImageDraftId)).toBe('sent');
      expect(sender.sent).toHaveLength(2);
      expect(sender.sent[1]!.title).toBe('Legacy picture');
      expect(sender.sent[1]!.imageUrl).toBe(`${ORIGIN}/${LEGACY_KEY}`);
    });

    it('a NEW notification with an image now saves, lists and is sent with the push JPEG, next to the old ones', async () => {
      const uploaded = await api()
        .post(`${NOTIFICATIONS}/images`)
        .set(admin.auth)
        .set('Content-Type', 'image/png')
        .send(png);
      expect(uploaded.status).toBe(201);
      const { imageKey, imageUrl } = uploaded.body.data as { imageKey: string; imageUrl: string };
      expect(imageKey).toMatch(/^onusfit\/notifications\/[0-9a-f]{32}\.webp$/);
      expect(imageUrl).toBe(`${ORIGIN}/${imageKey}`);

      const created = await api()
        .post(NOTIFICATIONS)
        .set(admin.auth)
        .send({
          title: 'With a picture',
          body: 'New and illustrated',
          category: 'announcements',
          destination: null,
          imageKey,
          audience: { type: 'users', userIds: [member.id] },
          mode: 'schedule',
          scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
        });
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ imageKey, imageUrl });

      const list = await api().get(`${NOTIFICATIONS}?limit=50`).set(admin.auth);
      const byTitle = new Map(
        (list.body.data as { title: string; imageKey: string | null; imageUrl: string | null }[]).map((c) => [
          c.title,
          c,
        ]),
      );
      expect(byTitle.get('With a picture')).toMatchObject({ imageKey, imageUrl });
      for (const title of [
        'Legacy sent',
        'Legacy partially failed',
        'Legacy due',
        'Plain draft',
        'Edited legacy draft',
      ]) {
        expect(byTitle.get(title), title).toMatchObject({ imageKey: null, imageUrl: null });
      }

      // Dispatch it: the push carries the JPEG next to the WebP; the earlier ones did not.
      const id = created.body.data.id as string;
      await sql(
        "UPDATE notification_campaigns SET scheduled_at = now() - interval '1 second' WHERE id = $1",
        [id],
      );
      await dispatchUntilDone(id);
      expect(await statusOf(id)).toBe('sent');
      expect(sender.sent).toHaveLength(3);
      expect(sender.sent[2]!.title).toBe('With a picture');
      expect(sender.sent[2]!.imageUrl).toBe(`${ORIGIN}/${pushKeyOf(imageKey)}`);
    });

    it('members still see their inbox and notice no change', async () => {
      const res = await api().get('/api/v1/notifications').set(memberAuth.auth);
      expect(res.status).toBe(200);
      const items = res.body.data.items as Record<string, unknown>[];
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item).not.toHaveProperty('imageKey');
        expect(item).not.toHaveProperty('imageUrl');
      }
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('stage 4: migration 0023 is applied to the same running app', () => {
    it('applies exactly one migration, 0023, with the history of 0001..0022 intact (checksums verified)', async () => {
      const { applied } = await runMigrations({ pool: db.pool, directory: upToExerciseImage });
      expect(applied).toEqual(['0023_add_exercise_image_key.sql']);
      expect(await maxVersion()).toBe(EXERCISE_IMAGE_MIGRATION);
      expect(await exerciseColumnExists()).toBe(true);
    });

    it('is a no-op the second time', async () => {
      expect((await runMigrations({ pool: db.pool, directory: upToExerciseImage })).applied).toEqual([]);
    });

    it('added a nullable column with no default, and rewrote no exercise: every row is byte for byte what it was', async () => {
      const col = await sql<{ is_nullable: string; column_default: string | null; data_type: string }>(
        "SELECT is_nullable, column_default, data_type FROM information_schema.columns WHERE table_name = 'exercises' AND column_name = 'image_key'",
      );
      expect(col.rows[0]).toEqual({ is_nullable: 'YES', column_default: null, data_type: 'text' });
      expect(await exerciseSnapshot()).toEqual(exercisesBefore);
      const { rows } = await sql<{ n: number }>(
        'SELECT count(*)::int AS n FROM exercises WHERE image_key IS NULL',
      );
      expect(rows[0]!.n).toBe(exercisesBefore.length);
    });

    it('left image_url and video_url exactly as they were', async () => {
      const { rows } = await sql<{ id: string; image_url: string | null; video_url: string | null }>(
        'SELECT id, image_url, video_url FROM exercises ORDER BY id',
      );
      expect(rows).toEqual(
        exercisesBefore.map((row) => ({ id: row.id, image_url: row.image_url, video_url: row.video_url })),
      );
    });

    it('has exactly one CHECK on the column, and it pins the exercise key shape', async () => {
      const def = (await exerciseCheckDefinition()) ?? '';
      expect(def).toContain('onusfit/exercises');
      expect(def).not.toContain('notifications');
      const { rows } = await sql(
        `SELECT 1 FROM pg_constraint WHERE conrelid = 'exercises'::regclass AND conname LIKE 'exercises_image_key%'`,
      );
      expect(rows).toHaveLength(1);
    });

    it('the database accepts NULL and the canonical exercise key, and nothing else', async () => {
      const insertKey = (key: string | null) =>
        sql(
          `INSERT INTO exercises (name, primary_muscles, equipment, category, difficulty, image_key, is_system)
           VALUES ('Direct insert', ARRAY['chest'], 'barbell', 'strength', 'beginner', $1, true)`,
          [key],
        );
      await expect(insertKey(null)).resolves.toBeDefined();
      await expect(insertKey(`onusfit/exercises/${HEX}.webp`)).resolves.toBeDefined();
      await sql("DELETE FROM exercises WHERE name = 'Direct insert'");
      for (const bad of [
        `onusfit/notifications/${HEX}.webp`,
        `notifications/${HEX}.png`,
        `onusfit/exercises/${HEX}.push.jpg`,
        `onusfit/exercises/${HEX}.png`,
        `onusfit/exercises/${HEX.toUpperCase()}.webp`,
        `onusfit/exercises/../exercises/${HEX}.webp`,
        `https://media.example.test/onusfit/exercises/${HEX}.webp`,
        `onusfit/exercises/${HEX}.webp\n`,
        '',
      ]) {
        await expect(insertKey(bad), JSON.stringify(bad)).rejects.toMatchObject({ code: '23514' });
      }
      expect((await sql("SELECT 1 FROM exercises WHERE name = 'Direct insert'")).rows).toHaveLength(0);
    });

    it('did not touch the notification constraint: it still names both of its key shapes', async () => {
      const def = (await checkDefinition()) ?? '';
      expect(def).toContain('onusfit/notifications');
      expect(def).toContain('notifications/');
      expect(def).not.toContain('exercises');
    });

    it('exercises that existed before show exactly what they showed before (the mobile contract)', async () => {
      const list = await api().get(MEMBER_EXERCISES).set(memberAuth.auth);
      expect(list.status).toBe(200);
      const byId = new Map((list.body.data as { id: string }[]).map((exercise) => [exercise.id, exercise]));
      expect(byId.get(legacyExercise.system)).toMatchObject({
        imageUrl: EXTERNAL,
        imageKey: null,
        externalImageUrl: EXTERNAL,
        videoUrl: 'https://youtu.be/legacy',
      });
      expect(byId.get(legacyExercise.custom)).toMatchObject({
        imageUrl: 'http://cdn.example.com/custom.jpg',
      });
      expect(byId.get(legacyExercise.plain)).toMatchObject({ imageUrl: null });
      expect(byId.get(legacyExercise.unsafe)).toMatchObject({ imageUrl: null, videoUrl: null });
      expect(byId.has(legacyExercise.deleted)).toBe(false);
    });

    it('exercises can be created and edited again (the writes name the column, which exists now)', async () => {
      const created = await api()
        .post(ADMIN_EXERCISES)
        .set(adminAuth().auth)
        .send({
          name: 'New squat',
          instructions: ['Stand'],
          primaryMuscles: ['quads'],
          equipment: 'barbell',
          category: 'strength',
          difficulty: 'beginner',
          imageUrl: 'https://cdn.example.com/new.jpg',
        });
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({
        imageUrl: 'https://cdn.example.com/new.jpg',
        imageKey: null,
      });
      const edited = await api()
        .put(`${ADMIN_EXERCISES}/${legacyExercise.plain}`)
        .set(adminAuth().auth)
        .send({ name: 'Plain, edited' });
      expect(edited.status).toBe(200);
      expect(edited.body.data).toMatchObject({ name: 'Plain, edited', imageUrl: null });
    });

    it('an uploaded image attaches to an exercise that existed before, wins over its address, and removing it brings the address back', async () => {
      const uploaded = await api()
        .post(`${ADMIN_EXERCISES}/images`)
        .set(adminAuth().auth)
        .set('Content-Type', 'image/png')
        .send(png);
      expect(uploaded.status).toBe(201);
      const { imageKey, imageUrl } = uploaded.body.data as { imageKey: string; imageUrl: string };
      expect(imageKey).toMatch(EXERCISE_KEY_PATTERN);
      expect(imageUrl).toBe(`${ORIGIN}/${imageKey}`);

      const attached = await api()
        .put(`${ADMIN_EXERCISES}/${legacyExercise.system}`)
        .set(adminAuth().auth)
        .send({ imageKey });
      expect(attached.status).toBe(200);
      expect(attached.body.data).toMatchObject({
        imageUrl,
        imageKey,
        externalImageUrl: EXTERNAL,
        videoUrl: 'https://youtu.be/legacy',
      });
      // image_url and video_url are preserved beside the new key.
      expect(
        (
          await sql('SELECT image_url, video_url, image_key FROM exercises WHERE id = $1', [
            legacyExercise.system,
          ])
        ).rows[0],
      ).toEqual({
        image_url: EXTERNAL,
        video_url: 'https://youtu.be/legacy',
        image_key: imageKey,
      });
      const detail = await api().get(`${MEMBER_EXERCISES}/${legacyExercise.system}`).set(memberAuth.auth);
      expect(detail.body.data.imageUrl).toBe(imageUrl);

      const removed = await api()
        .put(`${ADMIN_EXERCISES}/${legacyExercise.system}`)
        .set(adminAuth().auth)
        .send({ imageKey: null });
      expect(removed.body.data).toMatchObject({ imageUrl: EXTERNAL, imageKey: null });
      expect(store.objects.has(imageKey)).toBe(true); // nothing is ever deleted
    });

    it('notifications are unaffected, and their images and exercise images live under their own prefixes', async () => {
      const list = await api().get(`${NOTIFICATIONS}?limit=50`).set(adminAuth().auth);
      expect(list.status).toBe(200);
      const prefixes = new Set(
        [...store.objects.keys()].map((key) =>
          key.startsWith('onusfit/exercises/')
            ? 'exercises'
            : key.startsWith('onusfit/notifications/')
              ? 'notifications'
              : 'legacy',
        ),
      );
      expect(prefixes).toEqual(new Set(['notifications', 'exercises', 'legacy']));
      expect((await sql('SELECT count(*)::int AS n FROM notification_campaigns')).rows[0]!.n).toBeGreaterThan(
        4,
      );
    });
  });
});

describe('migrations 0021, 0022 and 0023 applied together on an empty database (a new environment)', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase({ migrate: false });
  }, 120_000);

  afterAll(async () => {
    await db?.drop();
  });

  it('applies all three, in order, in a single run, and ends with the notification CHECK allowing both shapes', async () => {
    const { applied } = await runMigrations({ pool: db.pool, directory: MIGRATIONS_DIR });
    expect(applied).toHaveLength((await loadMigrations(MIGRATIONS_DIR)).length);
    // The three image migrations, in order, wherever later migrations (0024 and on) have been added after them.
    const tail = applied.filter((name) => /^002[123]_/.test(name));
    expect(tail).toEqual([
      '0021_add_notification_campaign_image.sql',
      '0022_allow_webp_notification_image_keys.sql',
      '0023_add_exercise_image_key.sql',
    ]);

    const { rows } = await db.pool.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'notification_campaigns_image_key_valid' AND conrelid = 'notification_campaigns'::regclass`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.def).toContain('onusfit/notifications');
  });

  it('and the exercise CHECK, pinned to its own prefix', async () => {
    const { rows } = await db.pool.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'exercises_image_key_valid' AND conrelid = 'exercises'::regclass`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.def).toContain('onusfit/exercises');
  });

  it('has contiguous migration versions with no gap (0001 up to the newest)', async () => {
    const { rows } = await db.pool.query<{ version: number }>(
      'SELECT version FROM schema_migrations ORDER BY version',
    );
    expect(rows.map((row) => row.version)).toEqual(Array.from({ length: rows.length }, (_, i) => i + 1));
    expect(rows.at(-1)!.version).toBe((await loadMigrations(MIGRATIONS_DIR)).length);
  });
});
