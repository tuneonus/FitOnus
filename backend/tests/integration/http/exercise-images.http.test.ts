import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { IMAGE_UPLOAD_MAX_BYTES } from '../../../src/shared/images/image-policy.js';
import { animatedWebp, GIF_BYTES, heicSample, padPng, realJpeg, realPng } from '../../helpers/images.js';
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
const ADMIN_EXERCISES = '/api/v1/admin/workouts/exercises';
const ADMIN_IMAGES = `${ADMIN_EXERCISES}/images`;
const MEMBER_EXERCISES = '/api/v1/workouts/exercises';
const KEY_PATTERN = /^onusfit\/exercises\/[0-9a-f]{32}\.webp$/;
const MISSING_KEY = 'onusfit/exercises/0123456789abcdef0123456789abcdef.webp';
const EXTERNAL = 'https://cdn.example.com/squat.jpg';

describe('exercise images over HTTP (real container + PostgreSQL, real image processing, fake R2)', () => {
  let ctx: TestContext;
  let store: FakeImageStore;
  let admin: LoggedIn;
  let adminUser: SeededUser;
  let member: LoggedIn;
  let png: Buffer;

  const api = () => request(ctx.app);
  const pool = () => ctx.db.pool;

  const upload = (who: LoggedIn | null, body: Buffer | string, contentType: string | null = 'image/png') => {
    let req = api().post(ADMIN_IMAGES);
    if (who) req = req.set(who.auth);
    if (contentType) req = req.set('Content-Type', contentType);
    return req.send(body);
  };

  const uploadPng = async (): Promise<{ imageKey: string; imageUrl: string }> => {
    const res = await upload(admin, png);
    expect(res.status).toBe(201);
    return res.body.data as { imageKey: string; imageUrl: string };
  };

  const exerciseBody = (overrides: Record<string, unknown> = {}) => ({
    name: 'Barbell squat',
    instructions: ['Stand tall', 'Squat down'],
    primaryMuscles: ['quads'],
    equipment: 'barbell',
    category: 'strength',
    difficulty: 'beginner',
    ...overrides,
  });

  const create = (overrides: Record<string, unknown> = {}) =>
    api().post(ADMIN_EXERCISES).set(admin.auth).send(exerciseBody(overrides));

  const update = (id: string, body: Record<string, unknown>) =>
    api().put(`${ADMIN_EXERCISES}/${id}`).set(admin.auth).send(body);

  const rowOf = async (id: string) =>
    (
      await pool().query<{ image_url: string | null; image_key: string | null; video_url: string | null }>(
        'SELECT image_url, image_key, video_url FROM exercises WHERE id = $1',
        [id],
      )
    ).rows[0]!;

  /** An exercise written directly, the way every exercise was written before uploads existed. */
  const insertLegacy = async (imageUrl: string | null, videoUrl: string | null = null): Promise<string> =>
    (
      await pool().query<{ id: string }>(
        `INSERT INTO exercises (name, primary_muscles, equipment, category, difficulty, image_url, video_url, is_system)
         VALUES ('Legacy press', ARRAY['chest'], 'barbell', 'strength', 'beginner', $1, $2, true) RETURNING id`,
        [imageUrl, videoUrl],
      )
    ).rows[0]!.id;

  beforeAll(async () => {
    png = await realPng({ width: 640, height: 360 });
    store = new FakeImageStore();
    ctx = await createTestContext(R2_ENV, { pushSender: new FakeSender(), imageStore: store });
    adminUser = await seedUser(ctx.db.pool, { role: 'admin' });
    admin = await login(ctx.app, adminUser);
    const user = await seedUser(ctx.db.pool);
    member = await login(ctx.app, user);
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    admin = await login(ctx.app, adminUser);
    store.objects.clear();
    store.puts = 0;
    store.failPut = false;
    store.failExists = false;
    store.failPutWhen = null;
    await pool().query('DELETE FROM exercises');
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
    it('stores ONE WebP under onusfit/exercises/ with a random name and answers with the key and public URL', async () => {
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

      // No push copy: an exercise picture is shown in the app, not delivered by FCM.
      expect([...store.objects.keys()]).toEqual([imageKey]);
      const object = store.objects.get(imageKey as string)!;
      expect(object.contentType).toBe('image/webp');
      expect(object.cacheControl).toBe('public, max-age=31536000, immutable');
      expect((await sharp(Buffer.from(object.body)).metadata()).format).toBe('webp');
    });

    it('scales a 12-megapixel photo to the exercise size, 1600 px on the long side', async () => {
      const photo = await realJpeg({ width: 4000, height: 3000 });
      const res = await upload(admin, photo, 'image/jpeg');
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        width: 1600,
        height: 1200,
        source: { width: 4000, height: 3000 },
      });
      expect(
        await sharp(Buffer.from(store.objects.get(res.body.data.imageKey as string)!.body)).metadata(),
      ).toMatchObject({
        width: 1600,
        height: 1200,
      });
    });

    it('converts a HEIC photo end to end', async () => {
      const res = await upload(admin, heicSample(), 'image/heic');
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        contentType: 'image/webp',
        width: 96,
        height: 64,
        source: { format: 'heic' },
      });
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
        "SELECT action, admin_id, details FROM admin_audit_logs WHERE action = 'workout.exercise.image_upload'",
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.admin_id).toBe(adminUser.id);
      expect(rows[0]!.details).toMatchObject({
        imageKey: res.body.data.imageKey,
        sourceFormat: 'png',
        sourceBytes: png.length,
        storedBytes: res.body.data.sizeBytes,
        derivativeBytes: [],
        width: 640,
        height: 360,
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
        .post(`${ADMIN_IMAGES}?key=../../etc/passwd&name=evil`)
        .set(admin.auth)
        .set('Content-Type', 'image/png')
        .set('X-Object-Key', 'onusfit/exercises/chosen-by-client.webp')
        .send(png);
      expect(sneaky.status).toBe(201);
      expect(sneaky.body.data.imageKey).toMatch(KEY_PATTERN);
      expect([...store.objects.keys()].every((key) => key.startsWith('onusfit/exercises/'))).toBe(true);
    });

    it('is not an exercise yet: uploading attaches the picture to nothing', async () => {
      await upload(admin, png);
      expect((await pool().query('SELECT 1 FROM exercises')).rows).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('what may be uploaded', () => {
    it.each(['image/gif', 'image/svg+xml', 'application/pdf', 'text/html', 'application/octet-stream'])(
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

    it('refuses an animated image and a truncated one (422)', async () => {
      expect((await upload(admin, await animatedWebp(), 'image/webp')).status).toBe(422);
      expect((await upload(admin, png.subarray(0, png.length - 15))).status).toBe(422);
      expect(store.puts).toBe(0);
    });

    it('refuses a file one byte over 10 MiB with a readable 413', async () => {
      const res = await upload(admin, padPng(png, IMAGE_UPLOAD_MAX_BYTES + 1));
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
      expect(store.puts).toBe(0);
    });

    it('accepts a real picture well over the global JSON limit (the upload is not a JSON body)', async () => {
      expect((await upload(admin, padPng(png, 3 * 1_048_576))).status).toBe(201);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('saving an exercise with an uploaded image', () => {
    it('saves the key, answers with the uploaded image as the picture, and stores the key (never a URL)', async () => {
      const { imageKey, imageUrl } = await uploadPng();
      const res = await create({ imageKey });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ imageKey, imageUrl, externalImageUrl: null, videoUrl: null });

      const row = await rowOf(res.body.data.id as string);
      expect(row).toEqual({ image_url: null, image_key: imageKey, video_url: null });
    });

    it('keeps an external address beside it as the fallback, and the uploaded image wins', async () => {
      const { imageKey, imageUrl } = await uploadPng();
      const res = await create({ imageKey, imageUrl: EXTERNAL, videoUrl: 'https://youtu.be/abc' });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        imageUrl,
        imageKey,
        externalImageUrl: EXTERNAL,
        videoUrl: 'https://youtu.be/abc',
      });
    });

    it('records in the audit log that an image is attached, without the key', async () => {
      const { imageKey } = await uploadPng();
      await create({ imageKey });
      const { rows } = await pool().query<{ details: Record<string, unknown> }>(
        "SELECT details FROM admin_audit_logs WHERE action = 'workout.exercise.create'",
      );
      expect(rows[0]!.details).toMatchObject({ hasUploadedImage: true });
      expect(JSON.stringify(rows[0]!.details)).not.toContain('onusfit');
    });

    it('an exercise with only an external address behaves exactly as before', async () => {
      const res = await create({ imageUrl: EXTERNAL });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ imageUrl: EXTERNAL, imageKey: null, externalImageUrl: EXTERNAL });
      expect(await rowOf(res.body.data.id as string)).toMatchObject({ image_url: EXTERNAL, image_key: null });
    });

    it('an exercise without any image has none', async () => {
      const res = await create();
      expect(res.status).toBe(201);
      expect([res.body.data.imageUrl, res.body.data.imageKey, res.body.data.externalImageUrl]).toEqual([
        null,
        null,
        null,
      ]);
    });

    it('refuses a key whose object is not in storage (422) and saves nothing', async () => {
      const res = await create({ imageKey: MISSING_KEY });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('IMAGE_NOT_FOUND');
      expect((await pool().query('SELECT 1 FROM exercises')).rows).toHaveLength(0);
    });

    it('refuses with 503 when storage cannot be checked, saving nothing and saying nothing about why', async () => {
      const { imageKey } = await uploadPng();
      store.failExists = true;
      const res = await create({ imageKey });
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('IMAGE_STORAGE_UNAVAILABLE');
      expect(JSON.stringify(res.body)).not.toContain('R2 head failed');
      expect((await pool().query('SELECT 1 FROM exercises')).rows).toHaveLength(0);
    });

    it.each([
      ['a notification key', 'onusfit/notifications/0123456789abcdef0123456789abcdef.webp'],
      ['a legacy notification key', 'notifications/0123456789abcdef0123456789abcdef.png'],
      ['a push derivative', 'onusfit/exercises/0123456789abcdef0123456789abcdef.push.jpg'],
      ['a media URL', `${ORIGIN}/${MISSING_KEY}`],
      ['an external URL', 'https://evil.example/pixel.png'],
      ['path traversal', 'onusfit/exercises/../../etc/passwd'],
      ['a non-string', 42],
    ])('rejects %s as an imageKey (400), saving nothing', async (_name, imageKey) => {
      const res = await create({ imageKey });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect((await pool().query('SELECT 1 FROM exercises')).rows).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('external addresses are http or https and nothing else', () => {
    it.each(['https://cdn.example.com/a.jpg', 'http://cdn.example.com/a.jpg'])(
      'accepts %s (http stays valid for compatibility)',
      async (url) => {
        for (const field of ['imageUrl', 'videoUrl']) {
          const res = await create({ [field]: url });
          expect(res.status, field).toBe(201);
        }
      },
    );

    it.each([
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      'file:///etc/passwd',
      'ftp://x.example/a.png',
      '//cdn.example.com/a.jpg',
      '/images/a.jpg',
      'not a url',
      '',
    ])('refuses %j for both fields on create and on update (400)', async (value) => {
      const existing = await create();
      for (const field of ['imageUrl', 'videoUrl']) {
        expect((await create({ [field]: value })).status, `create ${field}`).toBe(400);
        expect(
          (await update(existing.body.data.id as string, { [field]: value })).status,
          `update ${field}`,
        ).toBe(400);
      }
    });

    it('a row saved before the rule existed is never passed on to an app', async () => {
      const id = await insertLegacy('javascript:alert(1)', 'data:text/html;base64,AAAA');
      const res = await api().get(`${MEMBER_EXERCISES}/${id}`).set(member.auth);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ imageUrl: null, externalImageUrl: null, videoUrl: null });
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('replacing and removing the uploaded image', () => {
    it('attaches an upload to an existing exercise, then replaces it, then removes it', async () => {
      const created = await create({ imageUrl: EXTERNAL });
      const id = created.body.data.id as string;

      const first = await uploadPng();
      const attached = await update(id, { imageKey: first.imageKey });
      expect(attached.status).toBe(200);
      expect(attached.body.data).toMatchObject({
        imageUrl: first.imageUrl,
        imageKey: first.imageKey,
        externalImageUrl: EXTERNAL,
      });

      const second = await uploadPng();
      const replaced = await update(id, { imageKey: second.imageKey });
      expect(replaced.body.data).toMatchObject({ imageUrl: second.imageUrl, imageKey: second.imageKey });

      const removed = await update(id, { imageKey: null });
      expect(removed.status).toBe(200);
      // The external address shows again.
      expect(removed.body.data).toMatchObject({
        imageUrl: EXTERNAL,
        imageKey: null,
        externalImageUrl: EXTERNAL,
      });
      expect(await rowOf(id)).toMatchObject({ image_url: EXTERNAL, image_key: null });
    });

    it('leaves every object in storage: replacing or removing only changes the reference', async () => {
      const created = await create();
      const id = created.body.data.id as string;
      const first = await uploadPng();
      const second = await uploadPng();
      await update(id, { imageKey: first.imageKey });
      await update(id, { imageKey: second.imageKey });
      await update(id, { imageKey: null });
      expect(store.objects.has(first.imageKey)).toBe(true);
      expect(store.objects.has(second.imageKey)).toBe(true);
    });

    it('an edit that does not mention the image leaves it alone', async () => {
      const { imageKey } = await uploadPng();
      const created = await create({ imageKey, imageUrl: EXTERNAL });
      const edited = await update(created.body.data.id as string, { name: 'Back squat' });
      expect(edited.body.data).toMatchObject({ name: 'Back squat', imageKey, externalImageUrl: EXTERNAL });
    });

    it('editing the text of an exercise never depends on R2 being reachable', async () => {
      const { imageKey } = await uploadPng();
      const created = await create({ imageKey });
      store.failExists = true;
      const edited = await update(created.body.data.id as string, { name: 'Back squat', imageKey });
      expect(edited.status).toBe(200);
      expect(edited.body.data).toMatchObject({ name: 'Back squat', imageKey });
    });

    it('refuses a new key whose object is missing (422), leaving the exercise unchanged', async () => {
      const { imageKey } = await uploadPng();
      const created = await create({ imageKey });
      const res = await update(created.body.data.id as string, { imageKey: MISSING_KEY, name: 'Changed' });
      expect(res.status).toBe(422);
      expect(await rowOf(created.body.data.id as string)).toMatchObject({ image_key: imageKey });
      const { rows } = await pool().query<{ name: string }>('SELECT name FROM exercises WHERE id = $1', [
        created.body.data.id,
      ]);
      expect(rows[0]!.name).toBe('Barbell squat');
    });

    it('an older admin client that sends the displayed picture back as the address does not corrupt image_url', async () => {
      const { imageKey, imageUrl } = await uploadPng();
      const created = await create({ imageKey });
      const res = await update(created.body.data.id as string, { name: 'Back squat', imageUrl });
      expect(res.status).toBe(200);
      expect(await rowOf(created.body.data.id as string)).toMatchObject({
        image_url: null,
        image_key: imageKey,
      });
    });

    it('deleting an exercise (soft delete) keeps its key and removes no object', async () => {
      const { imageKey } = await uploadPng();
      const created = await create({ imageKey });
      const id = created.body.data.id as string;
      const res = await api().delete(`${ADMIN_EXERCISES}/${id}`).set(admin.auth);
      expect(res.status).toBe(204);
      const { rows } = await pool().query<{ image_key: string; deleted_at: Date | null }>(
        'SELECT image_key, deleted_at FROM exercises WHERE id = $1',
        [id],
      );
      expect(rows[0]!.image_key).toBe(imageKey);
      expect(rows[0]!.deleted_at).not.toBeNull();
      expect(store.objects.has(imageKey)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('what the member app (mobile) reads: the contract is unchanged', () => {
    const mobileFields = [
      'id',
      'name',
      'description',
      'instructions',
      'tips',
      'commonMistakes',
      'primaryMuscles',
      'secondaryMuscles',
      'equipment',
      'category',
      'difficulty',
      'isCompound',
      'imageUrl',
      'videoUrl',
      'isSystem',
      'createdAt',
      'updatedAt',
    ];

    it('an exercise made before uploads existed shows exactly its stored address, in list and detail', async () => {
      const id = await insertLegacy(EXTERNAL, 'https://youtu.be/abc');
      const list = await api().get(MEMBER_EXERCISES).set(member.auth);
      expect(list.status).toBe(200);
      const item = (list.body.data as Record<string, unknown>[]).find((e) => e.id === id)!;
      for (const field of mobileFields) expect(item, field).toHaveProperty(field);
      expect(item).toMatchObject({ imageUrl: EXTERNAL, videoUrl: 'https://youtu.be/abc' });
      expect(typeof item.imageUrl).toBe('string');

      const detail = await api().get(`${MEMBER_EXERCISES}/${id}`).set(member.auth);
      expect(detail.body.data).toMatchObject({ imageUrl: EXTERNAL, videoUrl: 'https://youtu.be/abc' });
    });

    it('an exercise without any image still has imageUrl: null (the app shows its icon)', async () => {
      const id = await insertLegacy(null);
      const detail = await api().get(`${MEMBER_EXERCISES}/${id}`).set(member.auth);
      expect(detail.body.data.imageUrl).toBeNull();
    });

    it('the uploaded image is what imageUrl carries, in list and detail, so the app needs no change', async () => {
      const { imageKey, imageUrl } = await uploadPng();
      const created = await create({ imageKey, imageUrl: EXTERNAL });
      const id = created.body.data.id as string;
      const list = await api().get(MEMBER_EXERCISES).set(member.auth);
      expect((list.body.data as { id: string; imageUrl: string }[]).find((e) => e.id === id)!.imageUrl).toBe(
        imageUrl,
      );
      const detail = await api().get(`${MEMBER_EXERCISES}/${id}`).set(member.auth);
      expect(detail.body.data.imageUrl).toBe(imageUrl);
      // The URL is built from the trusted media origin and the key, and is https.
      expect(imageUrl).toBe(`${ORIGIN}/${imageKey}`);
    });

    it('prefers the uploaded image, and falls back to the address when the upload is removed', async () => {
      const { imageKey, imageUrl } = await uploadPng();
      const created = await create({ imageKey, imageUrl: EXTERNAL });
      const id = created.body.data.id as string;
      expect((await api().get(`${MEMBER_EXERCISES}/${id}`).set(member.auth)).body.data.imageUrl).toBe(
        imageUrl,
      );
      await update(id, { imageKey: null });
      expect((await api().get(`${MEMBER_EXERCISES}/${id}`).set(member.auth)).body.data.imageUrl).toBe(
        EXTERNAL,
      );
    });

    it('the admin list carries the key and the external address the editor needs', async () => {
      const { imageKey } = await uploadPng();
      await create({ imageKey, imageUrl: EXTERNAL });
      const list = await api().get(ADMIN_EXERCISES).set(admin.auth);
      expect(list.status).toBe(200);
      expect((list.body.data as Record<string, unknown>[])[0]).toMatchObject({
        imageKey,
        externalImageUrl: EXTERNAL,
      });
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('when storage is not configured', () => {
    it('answers 503 for uploads and for a key, while every exercise without an upload keeps working', async () => {
      const bare = await createTestContext({}, { pushSender: new FakeSender() });
      try {
        const adminAuth = await login(bare.app, await seedUser(bare.db.pool, { role: 'admin' }));
        const refused = await request(bare.app)
          .post(ADMIN_IMAGES)
          .set(adminAuth.auth)
          .set('Content-Type', 'image/png')
          .send(png);
        expect(refused.status).toBe(503);
        expect(refused.body.error.code).toBe('IMAGE_STORAGE_NOT_CONFIGURED');

        const withKey = await request(bare.app)
          .post(ADMIN_EXERCISES)
          .set(adminAuth.auth)
          .send(exerciseBody({ imageKey: MISSING_KEY }));
        expect(withKey.status).toBe(503);
        expect(withKey.body.error.code).toBe('IMAGE_STORAGE_NOT_CONFIGURED');

        const plain = await request(bare.app)
          .post(ADMIN_EXERCISES)
          .set(adminAuth.auth)
          .send(exerciseBody({ imageUrl: EXTERNAL }));
        expect(plain.status).toBe(201);
        expect(plain.body.data).toMatchObject({ imageUrl: EXTERNAL, imageKey: null });
      } finally {
        await bare.close();
      }
    });

    it('an exercise that has an uploaded image still shows its external address (an upload has no URL without a media domain)', async () => {
      const bare = await createTestContext({}, { pushSender: new FakeSender() });
      try {
        const adminAuth = await login(bare.app, await seedUser(bare.db.pool, { role: 'admin' }));
        await bare.db.pool.query(
          `INSERT INTO exercises (name, primary_muscles, equipment, category, difficulty, image_url, image_key, is_system)
           VALUES ('Orphaned', ARRAY['chest'], 'barbell', 'strength', 'beginner', $1, $2, true)`,
          [EXTERNAL, MISSING_KEY],
        );
        const list = await request(bare.app).get(ADMIN_EXERCISES).set(adminAuth.auth);
        expect((list.body.data as Record<string, unknown>[])[0]).toMatchObject({
          imageUrl: EXTERNAL,
          imageKey: MISSING_KEY,
        });
      } finally {
        await bare.close();
      }
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('the database CHECK on exercises.image_key', () => {
    const insertKey = (key: string | null) =>
      pool().query(
        `INSERT INTO exercises (name, primary_muscles, equipment, category, difficulty, image_key, is_system)
         VALUES ('Direct insert', ARRAY['chest'], 'barbell', 'strength', 'beginner', $1, true)`,
        [key],
      );

    it('accepts NULL and the canonical exercise key', async () => {
      await expect(insertKey(null)).resolves.toBeDefined();
      await expect(
        insertKey('onusfit/exercises/0123456789abcdef0123456789abcdef.webp'),
      ).resolves.toBeDefined();
    });

    it.each([
      'onusfit/notifications/0123456789abcdef0123456789abcdef.webp',
      'notifications/0123456789abcdef0123456789abcdef.png',
      'onusfit/exercises/0123456789abcdef0123456789abcdef.push.jpg',
      'onusfit/exercises/0123456789abcdef0123456789abcdef.png',
      'onusfit/exercises/0123456789ABCDEF0123456789ABCDEF.webp',
      'onusfit/exercises/0123456789abcdef.webp',
      'onusfit/exercises/../exercises/0123456789abcdef0123456789abcdef.webp',
      '/onusfit/exercises/0123456789abcdef0123456789abcdef.webp',
      'https://media.example.test/onusfit/exercises/0123456789abcdef0123456789abcdef.webp',
      'onusfit/exercises/0123456789abcdef0123456789abcdef.webp\n',
      'onusfit/exercises/0123456789abcdef0123456789abcdef.webp?x=1',
      '',
    ])('refuses %j', async (key) => {
      await expect(insertKey(key)).rejects.toMatchObject({ code: '23514' });
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
      const route = paths['/api/v1/admin/workouts/exercises/images']?.post;
      expect(route?.summary).toMatch(/upload exercise image/i);
      expect(route?.description).toMatch(/image\/webp/);
      expect(route?.description).toMatch(/image\/heic/);
      expect(route?.description).toMatch(/10 MB/);
      expect(route?.description).toMatch(/onusfit\/exercises/);
    });
  });
});
