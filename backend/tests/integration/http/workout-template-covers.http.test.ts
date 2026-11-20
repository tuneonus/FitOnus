import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { IMAGE_UPLOAD_MAX_BYTES } from '../../../src/shared/images/image-policy.js';
import { GIF_BYTES, heicSample, padPng, realJpeg, realPng } from '../../helpers/images.js';
import { FakeImageStore, FakeSender } from '../../helpers/notification-fakes.js';
import {
  createTestContext,
  login,
  seedUser,
  type LoggedIn,
  type SeededUser,
  type TestContext,
} from '../../helpers/test-app.js';

const ORIGIN = 'https://media.example.test';
// Obviously fake credentials, so a test can prove they never appear in any response.
const R2_ENV = {
  R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
  R2_ACCESS_KEY_ID: 'TESTACCESSKEYID000000',
  R2_SECRET_ACCESS_KEY: 'TEST-SECRET-ACCESS-KEY-THAT-MUST-NEVER-LEAK',
  R2_BUCKET: 'fitonus-media',
  R2_PUBLIC_BASE_URL: ORIGIN,
};
const ADMIN_TEMPLATES = '/api/v1/admin/workouts/templates';
const ADMIN_COVERS = `${ADMIN_TEMPLATES}/images`;
const MEMBER_PLANS = '/api/v1/workouts/plans';
const KEY_PATTERN = /^onusfit\/workouts\/[0-9a-f]{32}\.webp$/;
const MISSING_KEY = 'onusfit/workouts/0123456789abcdef0123456789abcdef.webp';

describe('workout template covers over HTTP (real container + PostgreSQL, real image processing, fake R2)', () => {
  let ctx: TestContext;
  let store: FakeImageStore;
  let admin: LoggedIn;
  let adminUser: SeededUser;
  let member: LoggedIn;
  let memberUser: SeededUser;
  let png: Buffer;
  let exerciseId: string;

  const api = () => request(ctx.app);
  const pool = () => ctx.db.pool;

  const upload = (who: LoggedIn | null, body: Buffer | string, contentType: string | null = 'image/png') => {
    let req = api().post(ADMIN_COVERS);
    if (who) req = req.set(who.auth);
    if (contentType) req = req.set('Content-Type', contentType);
    return req.send(body);
  };

  const uploadPng = async (): Promise<{ imageKey: string; imageUrl: string }> => {
    const res = await upload(admin, png);
    expect(res.status).toBe(201);
    return res.body.data as { imageKey: string; imageUrl: string };
  };

  const templateBody = (overrides: Record<string, unknown> = {}) => ({
    name: 'Full body starter',
    description: 'Three days a week',
    difficulty: 'beginner',
    tags: ['starter'],
    exercises: [{ exerciseId, orderIndex: 0, targetSets: 3, targetReps: '8-12', restSeconds: 90 }],
    ...overrides,
  });

  const create = (overrides: Record<string, unknown> = {}) =>
    api().post(ADMIN_TEMPLATES).set(admin.auth).send(templateBody(overrides));

  const update = (id: string, body: Record<string, unknown>) =>
    api().put(`${ADMIN_TEMPLATES}/${id}`).set(admin.auth).send(body);

  const coverOf = async (id: string): Promise<string | null> =>
    (
      await pool().query<{ cover_image_key: string | null }>(
        'SELECT cover_image_key FROM workouts WHERE id = $1',
        [id],
      )
    ).rows[0]!.cover_image_key;

  /** A template written directly, the way every template was written before covers existed. */
  const insertLegacyTemplate = async (): Promise<string> =>
    (
      await pool().query<{ id: string }>(
        `INSERT INTO workouts (name, description, is_template, user_id) VALUES ('Legacy starter', 'old', true, NULL)
         RETURNING id`,
      )
    ).rows[0]!.id;

  beforeAll(async () => {
    png = await realPng({ width: 640, height: 360 });
    store = new FakeImageStore();
    ctx = await createTestContext(R2_ENV, { pushSender: new FakeSender(), imageStore: store });
    adminUser = await seedUser(ctx.db.pool, { role: 'admin' });
    admin = await login(ctx.app, adminUser);
    memberUser = await seedUser(ctx.db.pool);
    member = await login(ctx.app, memberUser);
    exerciseId = (
      await pool().query<{ id: string }>(
        `INSERT INTO exercises (name, primary_muscles, equipment, category, difficulty, is_system)
         VALUES ('Goblet squat', ARRAY['quads'], 'dumbbell', 'strength', 'beginner', true) RETURNING id`,
      )
    ).rows[0]!.id;
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    admin = await login(ctx.app, adminUser);
    member = await login(ctx.app, memberUser);
    store.objects.clear();
    store.puts = 0;
    store.failPut = false;
    store.failExists = false;
    store.failPutWhen = null;
    await pool().query('DELETE FROM workouts');
    await pool().query('DELETE FROM admin_audit_logs');
  });

  // ---------------------------------------------------------------------------------------------
  describe('who may upload', () => {
    it('refuses a request with no credentials (401) and stores nothing', async () => {
      const res = await upload(null, png);
      expect(res.status).toBe(401);
      expect(store.puts).toBe(0);
    });

    it('refuses a signed-in member (403), even with a perfectly valid image', async () => {
      const res = await upload(member, png);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(store.puts).toBe(0);
    });

    it('lets an admin upload (201)', async () => {
      expect((await upload(admin, png)).status).toBe(201);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('a successful upload', () => {
    it('stores ONE WebP under onusfit/workouts/ with a random name and answers with the key and public URL', async () => {
      const res = await upload(admin, png);
      expect(res.status).toBe(201);
      const { imageKey, imageUrl, contentType, width, height, source } = res.body.data as Record<
        string,
        unknown
      >;
      expect(imageKey).toMatch(KEY_PATTERN);
      expect(imageUrl).toBe(`${ORIGIN}/${imageKey as string}`);
      expect(contentType).toBe('image/webp');
      expect([width, height]).toEqual([640, 360]);
      expect(source).toEqual({ format: 'png', bytes: png.length, width: 640, height: 360 });

      // No second copy: a cover is shown in the app, not delivered by FCM.
      expect([...store.objects.keys()]).toEqual([imageKey]);
      const object = store.objects.get(imageKey as string)!;
      expect(object.contentType).toBe('image/webp');
      expect(object.cacheControl).toBe('public, max-age=31536000, immutable');
      expect((await sharp(Buffer.from(object.body)).metadata()).format).toBe('webp');
    });

    it('scales a 12-megapixel photo to the cover size, 1600 px on the long side', async () => {
      const photo = await realJpeg({ width: 4000, height: 3000 });
      const res = await upload(admin, photo, 'image/jpeg');
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        width: 1600,
        height: 1200,
        source: { width: 4000, height: 3000 },
      });
    });

    it('converts a HEIC photo end to end', async () => {
      const res = await upload(admin, heicSample(), 'image/heic');
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ contentType: 'image/webp', source: { format: 'heic' } });
    });

    it('removes EXIF, including GPS and camera details', async () => {
      const withGps = await realJpeg({ width: 400, height: 300, exif: true });
      const res = await upload(admin, withGps, 'image/jpeg');
      expect(res.status).toBe(201);
      for (const object of store.objects.values()) {
        const body = Buffer.from(object.body);
        expect((await sharp(body).metadata()).exif).toBeUndefined();
        expect(body.includes(Buffer.from('PrivateCameraMaker'))).toBe(false);
      }
    });

    it('records who uploaded what in the audit log, with sizes and no URL', async () => {
      const res = await upload(admin, png);
      const { rows } = await pool().query<{
        action: string;
        admin_id: string;
        details: Record<string, unknown>;
      }>(
        "SELECT action, admin_id, details FROM admin_audit_logs WHERE action = 'workout.template.cover_upload'",
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.admin_id).toBe(adminUser.id);
      expect(rows[0]!.details).toMatchObject({
        imageKey: res.body.data.imageKey,
        sourceFormat: 'png',
        storedBytes: res.body.data.sizeBytes,
        derivativeBytes: [],
      });
      expect(JSON.stringify(rows[0]!.details)).not.toContain('http');
    });

    it('never puts a credential in a response, and never lets the client choose the name', async () => {
      const res = await upload(admin, png);
      const text = JSON.stringify(res.body) + JSON.stringify(res.headers);
      for (const secret of [R2_ENV.R2_SECRET_ACCESS_KEY, R2_ENV.R2_ACCESS_KEY_ID, R2_ENV.R2_ACCOUNT_ID]) {
        expect(text).not.toContain(secret);
      }
      const sneaky = await api()
        .post(`${ADMIN_COVERS}?key=../../etc/passwd&name=evil`)
        .set(admin.auth)
        .set('Content-Type', 'image/png')
        .set('X-Object-Key', 'onusfit/workouts/chosen-by-client.webp')
        .send(png);
      expect(sneaky.status).toBe(201);
      expect(sneaky.body.data.imageKey).toMatch(KEY_PATTERN);
      expect([...store.objects.keys()].every((key) => key.startsWith('onusfit/workouts/'))).toBe(true);
    });

    it('is not attached to anything yet: uploading changes no template', async () => {
      const id = await insertLegacyTemplate();
      await upload(admin, png);
      expect(await coverOf(id)).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('what may be uploaded (the shared pipeline, checked through this route)', () => {
    it.each(['image/gif', 'image/svg+xml', 'application/pdf', 'text/html'])(
      'refuses the declared type %s with 415, without storing anything',
      async (contentType) => {
        const res = await upload(admin, Buffer.from('irrelevant'), contentType);
        expect(res.status).toBe(415);
        expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
        expect(store.puts).toBe(0);
      },
    );

    it('looks at the content: a GIF named image/png is refused with 422', async () => {
      const res = await upload(admin, GIF_BYTES, 'image/png');
      expect(res.status).toBe(422);
      expect(res.body.error.message).toMatch(/is a GIF/);
      expect(store.puts).toBe(0);
    });

    it('refuses a truncated image (422) and a file one byte over 10 MiB (413)', async () => {
      expect((await upload(admin, png.subarray(0, png.length - 15))).status).toBe(422);
      const tooBig = await upload(admin, padPng(png, IMAGE_UPLOAD_MAX_BYTES + 1));
      expect(tooBig.status).toBe(413);
      expect(tooBig.body.error.code).toBe('PAYLOAD_TOO_LARGE');
      expect(store.puts).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('saving a template with a cover', () => {
    it('saves the key, answers with the cover URL, and stores the key (never a URL)', async () => {
      const { imageKey, imageUrl } = await uploadPng();
      const res = await create({ coverImageKey: imageKey });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        coverImageKey: imageKey,
        coverImageUrl: imageUrl,
        isTemplate: true,
        userId: null,
      });
      expect(await coverOf(res.body.data.id as string)).toBe(imageKey);
    });

    it('records in the audit log that a cover is attached, without the key', async () => {
      const { imageKey } = await uploadPng();
      await create({ coverImageKey: imageKey });
      const { rows } = await pool().query<{ details: Record<string, unknown> }>(
        "SELECT details FROM admin_audit_logs WHERE action = 'workout.template.create'",
      );
      expect(rows[0]!.details).toMatchObject({ hasCover: true });
      expect(JSON.stringify(rows[0]!.details)).not.toContain('onusfit');
    });

    it('a template without a cover has none, and behaves exactly as before', async () => {
      const res = await create();
      expect(res.status).toBe(201);
      expect([res.body.data.coverImageUrl, res.body.data.coverImageKey]).toEqual([null, null]);
      expect(res.body.data).toMatchObject({ name: 'Full body starter', tags: ['starter'] });
    });

    it('refuses a key whose object is not in storage (422) and saves nothing', async () => {
      const res = await create({ coverImageKey: MISSING_KEY });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('IMAGE_NOT_FOUND');
      expect((await pool().query('SELECT 1 FROM workouts')).rows).toHaveLength(0);
    });

    it('refuses with 503 when storage cannot be checked, saving nothing and saying nothing about why', async () => {
      const { imageKey } = await uploadPng();
      store.failExists = true;
      const res = await create({ coverImageKey: imageKey });
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('IMAGE_STORAGE_UNAVAILABLE');
      expect(JSON.stringify(res.body)).not.toContain('R2 head failed');
      expect((await pool().query('SELECT 1 FROM workouts')).rows).toHaveLength(0);
    });

    it.each([
      ['an exercise key', 'onusfit/exercises/0123456789abcdef0123456789abcdef.webp'],
      ['a notification key', 'onusfit/notifications/0123456789abcdef0123456789abcdef.webp'],
      ['a legacy notification key', 'notifications/0123456789abcdef0123456789abcdef.png'],
      ['a derivative', 'onusfit/workouts/0123456789abcdef0123456789abcdef.push.jpg'],
      ['a media URL', `${ORIGIN}/${MISSING_KEY}`],
      ['an external URL', 'https://evil.example/pixel.png'],
      ['path traversal', 'onusfit/workouts/../../etc/passwd'],
      ['a non-string', 42],
    ])('rejects %s as a coverImageKey (400), saving nothing', async (_name, coverImageKey) => {
      const res = await create({ coverImageKey });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect((await pool().query('SELECT 1 FROM workouts')).rows).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('replacing and removing the cover', () => {
    it('attaches an upload to an existing template, then replaces it, then removes it', async () => {
      const created = await create();
      const id = created.body.data.id as string;

      const first = await uploadPng();
      const attached = await update(id, { coverImageKey: first.imageKey });
      expect(attached.status).toBe(200);
      expect(attached.body.data).toMatchObject({
        coverImageKey: first.imageKey,
        coverImageUrl: first.imageUrl,
      });

      const second = await uploadPng();
      const replaced = await update(id, { coverImageKey: second.imageKey });
      expect(replaced.body.data).toMatchObject({
        coverImageKey: second.imageKey,
        coverImageUrl: second.imageUrl,
      });
      expect(await coverOf(id)).toBe(second.imageKey);

      const removed = await update(id, { coverImageKey: null });
      expect(removed.status).toBe(200);
      expect(removed.body.data).toMatchObject({ coverImageKey: null, coverImageUrl: null });
      expect(await coverOf(id)).toBeNull();
    });

    it('leaves every object in storage: replacing or removing only changes the reference', async () => {
      const id = (await create()).body.data.id as string;
      const first = await uploadPng();
      const second = await uploadPng();
      await update(id, { coverImageKey: first.imageKey });
      await update(id, { coverImageKey: second.imageKey });
      await update(id, { coverImageKey: null });
      expect(store.objects.has(first.imageKey)).toBe(true);
      expect(store.objects.has(second.imageKey)).toBe(true);
      // The only writes were the two uploads: nothing is ever written, moved or removed by saving.
      expect(store.puts).toBe(2);
    });

    it('an edit that does not mention the cover leaves it alone, including the exercises it rewrites', async () => {
      const { imageKey } = await uploadPng();
      const id = (await create({ coverImageKey: imageKey })).body.data.id as string;
      const edited = await update(id, {
        name: 'Full body v2',
        exercises: [{ exerciseId, orderIndex: 0, targetSets: 4, targetReps: '6-8', restSeconds: 120 }],
      });
      expect(edited.status).toBe(200);
      expect(edited.body.data).toMatchObject({ name: 'Full body v2', coverImageKey: imageKey });
      expect(await coverOf(id)).toBe(imageKey);
    });

    it('editing the text of a template never depends on R2 being reachable', async () => {
      const { imageKey } = await uploadPng();
      const id = (await create({ coverImageKey: imageKey })).body.data.id as string;
      store.failExists = true;
      const edited = await update(id, { name: 'Full body v2', coverImageKey: imageKey });
      expect(edited.status).toBe(200);
      expect(edited.body.data).toMatchObject({ name: 'Full body v2', coverImageKey: imageKey });
    });

    it('refuses a new key whose object is missing (422), leaving the template unchanged', async () => {
      const { imageKey } = await uploadPng();
      const id = (await create({ coverImageKey: imageKey })).body.data.id as string;
      const res = await update(id, { coverImageKey: MISSING_KEY, name: 'Changed' });
      expect(res.status).toBe(422);
      expect(await coverOf(id)).toBe(imageKey);
      const { rows } = await pool().query<{ name: string }>('SELECT name FROM workouts WHERE id = $1', [id]);
      expect(rows[0]!.name).toBe('Full body starter');
    });

    it('records whether the cover changed in the audit log', async () => {
      const id = (await create()).body.data.id as string;
      const { imageKey } = await uploadPng();
      await update(id, { coverImageKey: imageKey });
      await update(id, { name: 'Renamed' });
      const { rows } = await pool().query<{ details: Record<string, unknown> }>(
        "SELECT details FROM admin_audit_logs WHERE action = 'workout.template.update' ORDER BY created_at",
      );
      expect(rows.map((r) => r.details.coverChanged)).toEqual([true, false]);
      expect(rows.every((r) => r.details.hasCover === true)).toBe(true);
    });

    it('deleting a template (soft delete) keeps its key and removes no object', async () => {
      const { imageKey } = await uploadPng();
      const id = (await create({ coverImageKey: imageKey })).body.data.id as string;
      const res = await api().delete(`${ADMIN_TEMPLATES}/${id}`).set(admin.auth);
      expect(res.status).toBe(204);
      const { rows } = await pool().query<{ cover_image_key: string; deleted_at: Date | null }>(
        'SELECT cover_image_key, deleted_at FROM workouts WHERE id = $1',
        [id],
      );
      expect(rows[0]!.cover_image_key).toBe(imageKey);
      expect(rows[0]!.deleted_at).not.toBeNull();
      expect(store.objects.has(imageKey)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('what the member app (mobile) reads: the contract only grows', () => {
    const mobileFields = [
      'id',
      'userId',
      'name',
      'description',
      'workoutType',
      'estimatedDurationMinutes',
      'difficulty',
      'isTemplate',
      'isAiGenerated',
      'tags',
      'exercisesCount',
      'createdAt',
      'updatedAt',
    ];

    it('the template list and detail carry coverImageUrl, with every earlier field unchanged', async () => {
      const { imageKey, imageUrl } = await uploadPng();
      const id = (await create({ coverImageKey: imageKey })).body.data.id as string;

      const list = await api().get(`${MEMBER_PLANS}?type=templates`).set(member.auth);
      expect(list.status).toBe(200);
      const item = (list.body.data as Record<string, unknown>[]).find((p) => p.id === id)!;
      for (const field of mobileFields) expect(item, field).toHaveProperty(field);
      expect(item).toMatchObject({ coverImageUrl: imageUrl, isTemplate: true, userId: null });

      const detail = await api().get(`${MEMBER_PLANS}/${id}`).set(member.auth);
      expect(detail.status).toBe(200);
      expect(detail.body.data).toMatchObject({ coverImageUrl: imageUrl });
      expect(detail.body.data.exercises).toHaveLength(1);
      // The URL is built from the trusted media origin and the key, and is https.
      expect(imageUrl).toBe(`${ORIGIN}/${imageKey}`);
    });

    it('a template made before covers existed shows coverImageUrl: null and is otherwise identical', async () => {
      const id = await insertLegacyTemplate();
      const list = await api().get(`${MEMBER_PLANS}?type=templates`).set(member.auth);
      const item = (list.body.data as Record<string, unknown>[]).find((p) => p.id === id)!;
      for (const field of mobileFields) expect(item, field).toHaveProperty(field);
      expect(item).toMatchObject({ coverImageUrl: null, coverImageKey: null, description: 'old' });
    });

    it('a removed cover stops being shown to members at once', async () => {
      const { imageKey } = await uploadPng();
      const id = (await create({ coverImageKey: imageKey })).body.data.id as string;
      await update(id, { coverImageKey: null });
      const detail = await api().get(`${MEMBER_PLANS}/${id}`).set(member.auth);
      expect(detail.body.data.coverImageUrl).toBeNull();
    });

    it('a member cannot give their own routine a cover: the field is ignored, and the routine has none', async () => {
      const { imageKey } = await uploadPng();
      const res = await api()
        .post(MEMBER_PLANS)
        .set(member.auth)
        .send({
          name: 'My routine',
          coverImageKey: imageKey,
          exercises: [{ exerciseId, orderIndex: 0 }],
        });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ coverImageKey: null, coverImageUrl: null, isTemplate: false });
      expect(await coverOf(res.body.data.id as string)).toBeNull();

      const edited = await api()
        .put(`${MEMBER_PLANS}/${res.body.data.id as string}`)
        .set(member.auth)
        .send({ name: 'My routine 2', coverImageKey: imageKey });
      expect(edited.status).toBe(200);
      expect(edited.body.data.coverImageKey).toBeNull();
      expect(await coverOf(res.body.data.id as string)).toBeNull();
    });

    it('a member cannot change a system template (403), so its cover cannot be changed either', async () => {
      const { imageKey } = await uploadPng();
      const id = (await create({ coverImageKey: imageKey })).body.data.id as string;
      const res = await api().put(`${MEMBER_PLANS}/${id}`).set(member.auth).send({ name: 'Hijacked' });
      expect(res.status).toBe(403);
      expect(await coverOf(id)).toBe(imageKey);
    });

    it('the admin list carries the key and URL the editor needs', async () => {
      const { imageKey, imageUrl } = await uploadPng();
      await create({ coverImageKey: imageKey });
      const list = await api().get(ADMIN_TEMPLATES).set(admin.auth);
      expect(list.status).toBe(200);
      expect((list.body.data as Record<string, unknown>[])[0]).toMatchObject({
        coverImageKey: imageKey,
        coverImageUrl: imageUrl,
      });
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('when storage is not configured', () => {
    it('answers 503 for uploads and for a key, while every template without a cover keeps working', async () => {
      const bare = await createTestContext({}, { pushSender: new FakeSender() });
      try {
        const adminAuth = await login(bare.app, await seedUser(bare.db.pool, { role: 'admin' }));
        const refused = await request(bare.app)
          .post(ADMIN_COVERS)
          .set(adminAuth.auth)
          .set('Content-Type', 'image/png')
          .send(png);
        expect(refused.status).toBe(503);
        expect(refused.body.error.code).toBe('IMAGE_STORAGE_NOT_CONFIGURED');

        const bareExercise = (
          await bare.db.pool.query<{ id: string }>(
            `INSERT INTO exercises (name, primary_muscles, equipment, category, difficulty, is_system)
             VALUES ('Row', ARRAY['back'], 'cable', 'strength', 'beginner', true) RETURNING id`,
          )
        ).rows[0]!.id;
        const body = (extra: Record<string, unknown> = {}) => ({
          name: 'Bare starter',
          exercises: [{ exerciseId: bareExercise, orderIndex: 0 }],
          ...extra,
        });

        const withKey = await request(bare.app)
          .post(ADMIN_TEMPLATES)
          .set(adminAuth.auth)
          .send(body({ coverImageKey: MISSING_KEY }));
        expect(withKey.status).toBe(503);
        expect(withKey.body.error.code).toBe('IMAGE_STORAGE_NOT_CONFIGURED');

        const plain = await request(bare.app).post(ADMIN_TEMPLATES).set(adminAuth.auth).send(body());
        expect(plain.status).toBe(201);
        expect(plain.body.data).toMatchObject({ coverImageKey: null, coverImageUrl: null });
      } finally {
        await bare.close();
      }
    });

    it('a template that has a cover still lists and loads (a cover has no URL without a media domain)', async () => {
      const bare = await createTestContext({}, { pushSender: new FakeSender() });
      try {
        const memberAuth = await login(bare.app, await seedUser(bare.db.pool));
        const id = (
          await bare.db.pool.query<{ id: string }>(
            `INSERT INTO workouts (name, is_template, user_id, cover_image_key)
             VALUES ('Orphaned', true, NULL, $1) RETURNING id`,
            [MISSING_KEY],
          )
        ).rows[0]!.id;
        const detail = await request(bare.app).get(`${MEMBER_PLANS}/${id}`).set(memberAuth.auth);
        expect(detail.status).toBe(200);
        expect(detail.body.data).toMatchObject({ coverImageUrl: null, coverImageKey: MISSING_KEY });
      } finally {
        await bare.close();
      }
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('the database CHECK on workouts.cover_image_key', () => {
    const insertTemplate = (key: string | null) =>
      pool().query(
        `INSERT INTO workouts (name, is_template, user_id, cover_image_key) VALUES ('Direct insert', true, NULL, $1)`,
        [key],
      );

    it('accepts NULL and the canonical workout key on a system template', async () => {
      await expect(insertTemplate(null)).resolves.toBeDefined();
      await expect(insertTemplate(MISSING_KEY)).resolves.toBeDefined();
    });

    it.each([
      'onusfit/exercises/0123456789abcdef0123456789abcdef.webp',
      'onusfit/notifications/0123456789abcdef0123456789abcdef.webp',
      'notifications/0123456789abcdef0123456789abcdef.png',
      'onusfit/workouts/0123456789abcdef0123456789abcdef.push.jpg',
      'onusfit/workouts/0123456789abcdef0123456789abcdef.png',
      'onusfit/workouts/0123456789ABCDEF0123456789ABCDEF.webp',
      'onusfit/workouts/0123456789abcdef.webp',
      'onusfit/workouts/../workouts/0123456789abcdef0123456789abcdef.webp',
      '/onusfit/workouts/0123456789abcdef0123456789abcdef.webp',
      'https://media.example.test/onusfit/workouts/0123456789abcdef0123456789abcdef.webp',
      'onusfit/workouts/0123456789abcdef0123456789abcdef.webp\n',
      'onusfit/workouts/0123456789abcdef0123456789abcdef.webp?x=1',
      '',
    ])('refuses the shape %j', async (key) => {
      await expect(insertTemplate(key)).rejects.toMatchObject({ code: '23514' });
    });

    it("refuses a cover on a member's own routine, whatever the application does (the bucket is public)", async () => {
      await expect(
        pool().query(
          `INSERT INTO workouts (name, is_template, user_id, cover_image_key) VALUES ('Mine', false, $1, $2)`,
          [memberUser.id, MISSING_KEY],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      // A template owned by a user is not a system template either.
      await expect(
        pool().query(
          `INSERT INTO workouts (name, is_template, user_id, cover_image_key) VALUES ('Mine', true, $1, $2)`,
          [memberUser.id, MISSING_KEY],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('API documentation', () => {
    it('lists the upload route in the OpenAPI document, describing the accepted formats and the size', async () => {
      const res = await api().get('/api/v1/openapi.json');
      const paths = res.body.paths as Record<
        string,
        Record<string, { summary: string; description?: string }>
      >;
      const route = paths['/api/v1/admin/workouts/templates/images']?.post;
      expect(route?.summary).toMatch(/upload workout template cover/i);
      expect(route?.description).toMatch(/image\/webp/);
      expect(route?.description).toMatch(/image\/heic/);
      expect(route?.description).toMatch(/10 MB/);
      expect(route?.description).toMatch(/onusfit\/workouts/);
    });
  });
});
