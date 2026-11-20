import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.js';
import { loadConfig } from '../../../src/config/env.js';
import { createContainer } from '../../../src/container.js';
import { loadMigrations, runMigrations } from '../../../src/database/migration-runner.js';
import { createLogger } from '../../../src/shared/logging/logger.js';
import { realPng } from '../../helpers/images.js';
import { FakeImageStore, FakeSender } from '../../helpers/notification-fakes.js';
import { login, seedUser, TEST_ENV, type LoggedIn } from '../../helpers/test-app.js';
import { createTestDatabase, MIGRATIONS_DIR, type TestDatabase } from '../../helpers/test-database.js';

/**
 * Migration 0024 adds workouts.cover_image_key (nullable) with a CHECK. It is applied to a database that already holds
 * workouts, while a build that knows about covers is already running, which is the real-world order mistake to guard
 * against ("code deployed before the migration"):
 *
 *   before 0024:  everything a member does with workouts keeps working, because only a SYSTEM TEMPLATE names the new
 *                 column when it is written (reads use SELECT * and see a missing column as "no cover"); saving a
 *                 template fails, which is why the order is migrate first
 *   after 0024:   covers work, and every workout that already existed was not rewritten
 */

const COVER_MIGRATION = 24;
const ORIGIN = 'https://media.example.test';
const R2_ENV = {
  R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
  R2_ACCESS_KEY_ID: 'TESTACCESSKEYID000000',
  R2_SECRET_ACCESS_KEY: 'TEST-SECRET-ACCESS-KEY-THAT-MUST-NEVER-LEAK',
  R2_BUCKET: 'fitonus-media',
  R2_PUBLIC_BASE_URL: ORIGIN,
};
const ADMIN_TEMPLATES = '/api/v1/admin/workouts/templates';
const MEMBER_PLANS = '/api/v1/workouts/plans';

describe('migration 0024: workout covers (code ahead of the schema, then migrated)', () => {
  let db: TestDatabase;
  let app: ReturnType<typeof createApp>;
  const dirs: string[] = [];
  let upToCover: string;
  let admin: LoggedIn;
  let member: LoggedIn;
  let memberId: string;
  let exerciseId: string;
  let png: Buffer;
  const store = new FakeImageStore();
  let legacy: { template: string; routine: string; deleted: string };
  let legacyBefore: Record<string, unknown>[];

  const api = () => request(app);
  const sql = <R extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ) => db.pool.query<R>(text, values);
  const columnExists = async () =>
    (
      await sql(
        "SELECT 1 FROM information_schema.columns WHERE table_name = 'workouts' AND column_name = 'cover_image_key'",
      )
    ).rows.length === 1;
  const maxVersion = async () =>
    (await sql<{ max: number }>('SELECT max(version)::int AS max FROM schema_migrations')).rows[0]!.max;
  /** The workouts that already existed, down to the transaction that wrote them: equal snapshots mean not rewritten. */
  const legacySnapshot = async () =>
    (
      await sql(
        `SELECT id, user_id, name, description, workout_type, estimated_duration_minutes, difficulty, is_template,
                is_ai_generated, tags, created_at, updated_at, deleted_at, xmin::text AS xmin
           FROM workouts WHERE id = ANY($1) ORDER BY id`,
        [Object.values(legacy)],
      )
    ).rows;
  const templateBody = (extra: Record<string, unknown> = {}) => ({
    name: 'New starter',
    exercises: [{ exerciseId, orderIndex: 0 }],
    ...extra,
  });

  beforeAll(async () => {
    png = await realPng({ width: 640, height: 360 });
    // A database exactly as it is before this feature: migrations 0001..0023 only.
    db = await createTestDatabase({ migrate: false });
    const dir = await mkdtemp(path.join(tmpdir(), 'migrations-before-0024-'));
    dirs.push(dir);
    const all = await loadMigrations(MIGRATIONS_DIR);
    for (const migration of all.filter((m) => m.version < COVER_MIGRATION)) {
      await writeFile(path.join(dir, migration.filename), migration.sql);
    }
    const through = await mkdtemp(path.join(tmpdir(), 'migrations-through-0024-'));
    dirs.push(through);
    for (const migration of all.filter((m) => m.version <= COVER_MIGRATION)) {
      await writeFile(path.join(through, migration.filename), migration.sql);
    }
    upToCover = through;
    await runMigrations({ pool: db.pool, directory: dir });

    const adminUser = await seedUser(db.pool, { role: 'admin' });
    const memberUser = await seedUser(db.pool);
    memberId = memberUser.id;
    exerciseId = (
      await sql<{ id: string }>(
        `INSERT INTO exercises (name, primary_muscles, equipment, category, difficulty, is_system)
         VALUES ('Goblet squat', ARRAY['quads'], 'dumbbell', 'strength', 'beginner', true) RETURNING id`,
      )
    ).rows[0]!.id;

    // Workouts that already exist, written the way they were before covers: a system template with an exercise, a
    // member's routine, and a soft-deleted template.
    const insertWorkout = async (name: string, options: { template?: boolean; deleted?: boolean } = {}) =>
      (
        await sql<{ id: string }>(
          `INSERT INTO workouts (name, description, is_template, user_id, tags, deleted_at)
           VALUES ($1, 'written before covers', $2, $3, ARRAY['legacy'], CASE WHEN $4::boolean THEN now() END)
           RETURNING id`,
          [
            name,
            options.template === true,
            options.template === true ? null : memberId,
            options.deleted === true,
          ],
        )
      ).rows[0]!.id;
    legacy = {
      template: await insertWorkout('Legacy starter', { template: true }),
      routine: await insertWorkout('Legacy routine'),
      deleted: await insertWorkout('Legacy deleted', { template: true, deleted: true }),
    };
    await sql('INSERT INTO workout_exercises (workout_id, exercise_id, order_index) VALUES ($1, $2, 0)', [
      legacy.template,
      exerciseId,
    ]);
    legacyBefore = await legacySnapshot();

    const config = loadConfig({ ...TEST_ENV, ...R2_ENV, DATABASE_URL: db.url });
    const container = createContainer(config, db.pool, undefined, {
      pushSender: new FakeSender(),
      imageStore: store,
    });
    app = createApp({ config, logger: createLogger({ level: 'silent', pretty: false }), container });
    admin = await login(app, adminUser);
    member = await login(app, memberUser);
  }, 180_000);

  afterAll(async () => {
    for (const dir of dirs) await rm(dir, { recursive: true, force: true });
    await db?.drop();
  });

  // ---------------------------------------------------------------------------------------------
  describe('stage 1: the schema is still behind (migrations 0001..0023, cover_image_key column missing)', () => {
    it('is the situation under test: the column is absent and every earlier migration is applied', async () => {
      expect(await columnExists()).toBe(false);
      expect(await maxVersion()).toBe(COVER_MIGRATION - 1);
    });

    it('members still read templates and their own routines, and see no cover (never a 500)', async () => {
      const templates = await api().get(`${MEMBER_PLANS}?type=templates`).set(member.auth);
      expect(templates.status).toBe(200);
      const item = (templates.body.data as Record<string, unknown>[]).find((p) => p.id === legacy.template)!;
      expect(item).toMatchObject({ name: 'Legacy starter', coverImageUrl: null, coverImageKey: null });

      const detail = await api().get(`${MEMBER_PLANS}/${legacy.template}`).set(member.auth);
      expect(detail.status).toBe(200);
      expect(detail.body.data).toMatchObject({ coverImageUrl: null, coverImageKey: null });
      expect(detail.body.data.exercises).toHaveLength(1);

      const mine = await api().get(`${MEMBER_PLANS}?type=mine`).set(member.auth);
      expect(mine.status).toBe(200);
    });

    it('members can still create and edit their own routines: only a template names the new column', async () => {
      const created = await api()
        .post(MEMBER_PLANS)
        .set(member.auth)
        .send({ name: 'Made during the gap', exercises: [{ exerciseId, orderIndex: 0 }] });
      expect(created.status).toBe(201);
      const edited = await api()
        .put(`${MEMBER_PLANS}/${created.body.data.id as string}`)
        .set(member.auth)
        .send({ name: 'Edited during the gap' });
      expect(edited.status).toBe(200);
      expect(edited.body.data.name).toBe('Edited during the gap');
    });

    it('the admin console still lists templates', async () => {
      const res = await api().get(ADMIN_TEMPLATES).set(admin.auth);
      expect(res.status).toBe(200);
      expect(res.body.data.map((t: { id: string }) => t.id)).toContain(legacy.template);
    });

    it('saving a template fails until the migration is applied (this is why the order is migrate first)', async () => {
      const before = (await sql('SELECT 1 FROM workouts WHERE is_template = true')).rows.length;
      const res = await api().post(ADMIN_TEMPLATES).set(admin.auth).send(templateBody());
      expect(res.status).toBe(500);
      expect((await sql('SELECT 1 FROM workouts WHERE is_template = true')).rows).toHaveLength(before);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('stage 2: migration 0024 is applied to the same running app', () => {
    it('applies exactly one migration, 0024, with the history of 0001..0023 intact (checksums verified)', async () => {
      const { applied } = await runMigrations({ pool: db.pool, directory: upToCover });
      expect(applied).toEqual(['0024_add_workout_cover_image_key.sql']);
      expect(await maxVersion()).toBe(COVER_MIGRATION);
      expect(await columnExists()).toBe(true);
    });

    it('is a no-op the second time', async () => {
      expect((await runMigrations({ pool: db.pool, directory: upToCover })).applied).toEqual([]);
    });

    it('added a nullable column with no default and a CHECK pinned to its own prefix', async () => {
      const col = await sql<{ is_nullable: string; column_default: string | null; data_type: string }>(
        "SELECT is_nullable, column_default, data_type FROM information_schema.columns WHERE table_name = 'workouts' AND column_name = 'cover_image_key'",
      );
      expect(col.rows[0]).toEqual({ is_nullable: 'YES', column_default: null, data_type: 'text' });
      const check = await sql<{ def: string }>(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conname = 'workouts_cover_image_key_valid' AND conrelid = 'workouts'::regclass`,
      );
      expect(check.rows).toHaveLength(1);
      expect(check.rows[0]!.def).toContain('onusfit/workouts');
    });

    it('rewrote no existing workout: every row is byte for byte what it was, and none has a cover', async () => {
      expect(await legacySnapshot()).toEqual(legacyBefore);
      const covers = await sql('SELECT 1 FROM workouts WHERE cover_image_key IS NOT NULL');
      expect(covers.rows).toHaveLength(0);
    });

    it('the same running app now saves covers: a new template, and an existing one that gets a cover later', async () => {
      const upload = await api()
        .post(`${ADMIN_TEMPLATES}/images`)
        .set(admin.auth)
        .set('Content-Type', 'image/png')
        .send(png);
      expect(upload.status).toBe(201);
      const { imageKey, imageUrl } = upload.body.data as { imageKey: string; imageUrl: string };

      const created = await api()
        .post(ADMIN_TEMPLATES)
        .set(admin.auth)
        .send(templateBody({ coverImageKey: imageKey }));
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ coverImageKey: imageKey, coverImageUrl: imageUrl });

      const attached = await api()
        .put(`${ADMIN_TEMPLATES}/${legacy.template}`)
        .set(admin.auth)
        .send({ coverImageKey: imageKey });
      expect(attached.status).toBe(200);
      expect(attached.body.data).toMatchObject({ name: 'Legacy starter', coverImageKey: imageKey });
      // Its exercises survived the edit, and members now see the cover.
      const detail = await api().get(`${MEMBER_PLANS}/${legacy.template}`).set(member.auth);
      expect(detail.body.data).toMatchObject({ coverImageUrl: imageUrl });
      expect(detail.body.data.exercises).toHaveLength(1);
    });

    it('a member routine and a soft-deleted template still cannot hold a cover or be shown one', async () => {
      await expect(
        sql('UPDATE workouts SET cover_image_key = $1 WHERE id = $2', [
          'onusfit/workouts/0123456789abcdef0123456789abcdef.webp',
          legacy.routine,
        ]),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });
});

describe('migration 0024 applied with every other migration on an empty database (a new environment)', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase({ migrate: false });
  }, 120_000);

  afterAll(async () => {
    await db?.drop();
  });

  it('applies in order, in a single run, after 0023', async () => {
    const { applied } = await runMigrations({ pool: db.pool, directory: MIGRATIONS_DIR });
    const names = applied.filter((name) => /^002[34]_/.test(name));
    expect(names).toEqual(['0023_add_exercise_image_key.sql', '0024_add_workout_cover_image_key.sql']);
    const { rows } = await db.pool.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'workouts_cover_image_key_valid' AND conrelid = 'workouts'::regclass`,
    );
    expect(rows).toHaveLength(1);
  });
});
