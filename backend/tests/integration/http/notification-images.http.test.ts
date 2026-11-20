import http from 'node:http';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { IMAGE_UPLOAD_MAX_BYTES } from '../../../src/shared/images/image-policy.js';
import {
  animatedWebp,
  GIF_BYTES,
  HTML_BYTES,
  heicSample,
  makePng,
  padPng,
  realJpeg,
  realPng,
  realWebp,
} from '../../helpers/images.js';
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
const IMAGES = '/api/v1/admin/notifications/images';
const NOTIFICATIONS = '/api/v1/admin/notifications';
const KEY_PATTERN = /^onusfit\/notifications\/[0-9a-f]{32}\.webp$/;
/** A key written before the image policy (the file is exactly what was uploaded). Existing campaigns hold these. */
const LEGACY_KEY = 'notifications/0123456789abcdef0123456789abcdef.png';
const MISSING_KEY = 'onusfit/notifications/0123456789abcdef0123456789abcdef.webp';
const pushKeyOf = (key: string): string => key.replace(/\.webp$/, '.push.jpg');
const tokenFor = (label: string) => `fcm_${label}_`.padEnd(40, 'x');

describe('notification images over HTTP (real container + PostgreSQL, real image processing, fake R2 and FCM)', () => {
  let ctx: TestContext;
  let store: FakeImageStore;
  let sender: FakeSender;
  let admin: LoggedIn;
  let adminUser: SeededUser;
  let member: { user: SeededUser; auth: LoggedIn };
  let png: Buffer;
  let jpeg: Buffer;
  let webp: Buffer;

  const api = () => request(ctx.app);
  const pool = () => ctx.db.pool;
  const dispatcher = () => ctx.container.notifications!.dispatcher!;

  /** Posts a raw image body, the way the admin console does. */
  const upload = (who: LoggedIn | null, body: Buffer | string, contentType: string | null = 'image/png') => {
    let req = api().post(IMAGES);
    if (who) req = req.set(who.auth);
    if (contentType) req = req.set('Content-Type', contentType);
    return req.send(body);
  };

  const uploadPng = async (): Promise<{ imageKey: string; imageUrl: string }> => {
    const res = await upload(admin, png);
    expect(res.status).toBe(201);
    return res.body.data as { imageKey: string; imageUrl: string };
  };

  const storedMeta = (key: string) => sharp(Buffer.from(store.objects.get(key)!.body)).metadata();

  const content = (overrides: Record<string, unknown> = {}) => ({
    title: 'New challenge',
    body: 'A fresh challenge is live.',
    category: 'announcements',
    destination: 'challenges',
    audience: { type: 'users', userIds: [member.user.id] },
    ...overrides,
  });

  const draft = (overrides: Record<string, unknown> = {}) =>
    api()
      .post(NOTIFICATIONS)
      .set(admin.auth)
      .send({ ...content(overrides), mode: 'draft' });

  /** Scheduled an hour ahead, so the in-process dispatcher cannot race the test. */
  const schedule = (overrides: Record<string, unknown> = {}) =>
    api()
      .post(NOTIFICATIONS)
      .set(admin.auth)
      .send({
        ...content(overrides),
        mode: 'schedule',
        scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
      });

  const registerDevice = async () => {
    const res = await api()
      .put('/api/v1/notifications/devices/install-image-test-1')
      .set(member.auth.auth)
      .send({
        installationId: 'install-image-test-1',
        pushToken: tokenFor('image'),
        platform: 'android',
        appVersion: '1.0.0',
        timeZone: 'Asia/Kolkata',
      });
    expect(res.status).toBe(200);
  };

  const runCampaign = async (id: string) => {
    await pool().query(
      "UPDATE notification_campaigns SET scheduled_at = now() - interval '1 second' WHERE id = $1 AND status = 'scheduled'",
      [id],
    );
    for (let i = 0; i < 6; i += 1) {
      await dispatcher().runOnce();
      const { rows } = await pool().query<{ status: string }>(
        'SELECT status FROM notification_campaigns WHERE id = $1',
        [id],
      );
      if (!['scheduled', 'sending'].includes(rows[0]!.status)) return rows[0]!.status;
    }
    throw new Error('campaign did not finish');
  };

  beforeAll(async () => {
    png = await realPng({ width: 640, height: 360 });
    jpeg = await realJpeg({ width: 1200, height: 630 });
    webp = await realWebp({ width: 400, height: 300 });
    store = new FakeImageStore();
    sender = new FakeSender();
    ctx = await createTestContext(R2_ENV, { pushSender: sender, imageStore: store });
    adminUser = await seedUser(ctx.db.pool, { role: 'admin' });
    admin = await login(ctx.app, adminUser);
    const user = await seedUser(ctx.db.pool);
    member = { user, auth: await login(ctx.app, user) };
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    // The admin rate limiter (60 per 15 min) is keyed by access token, so each test signs in for a fresh one.
    admin = await login(ctx.app, adminUser);
    store.objects.clear();
    store.puts = 0;
    store.failPut = false;
    store.failExists = false;
    store.failPutWhen = null;
    sender.sent = [];
    await pool().query('DELETE FROM notifications');
    await pool().query('DELETE FROM notification_campaigns');
    await pool().query('DELETE FROM user_push_devices');
    await pool().query('DELETE FROM admin_audit_logs');
    await pool().query('DELETE FROM idempotency_keys');
  });

  // ---------------------------------------------------------------------------------------------
  describe('who may upload', () => {
    it('refuses a request with no credentials (401) and stores nothing', async () => {
      const res = await upload(null, png);
      expect(res.status).toBe(401);
      expect(store.puts).toBe(0);
    });

    it('refuses a garbage token (401)', async () => {
      const res = await api()
        .post(IMAGES)
        .set('Authorization', 'Bearer not-a-real-token')
        .set('Content-Type', 'image/png')
        .send(png);
      expect(res.status).toBe(401);
      expect(store.puts).toBe(0);
    });

    it('refuses a signed-in member (403), even with a perfectly valid image', async () => {
      const res = await upload(member.auth, png);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(store.puts).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('what may be uploaded', () => {
    it.each([
      'image/gif',
      'image/svg+xml',
      'image/avif',
      'image/bmp',
      'image/tiff',
      'application/pdf',
      'text/html',
      'application/octet-stream',
    ])('refuses the declared type %s with 415, without reading the body', async (contentType) => {
      const res = await upload(admin, Buffer.from('irrelevant: the body is never read'), contentType);
      expect(res.status).toBe(415);
      expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
      expect(res.body.error.message).toMatch(/JPEG, PNG, WebP and HEIC/);
      expect(store.puts).toBe(0);
    });

    it('refuses a request with no Content-Type (415)', async () => {
      const res = await api().post(IMAGES).set(admin.auth).set('Content-Type', '').send(png);
      expect(res.status).toBe(415);
      expect(store.puts).toBe(0);
    });

    it('refuses a JSON body, which is not how an image is sent (415)', async () => {
      const res = await api().post(IMAGES).set(admin.auth).send({ image: 'data:image/png;base64,AAAA' });
      expect(res.status).toBe(415);
      expect(store.puts).toBe(0);
    });

    it.each([
      ['JPEG', 'image/jpeg', () => jpeg, 'jpeg'],
      ['PNG', 'image/png', () => png, 'png'],
      ['WebP', 'image/webp', () => webp, 'webp'],
      ['HEIC', 'image/heic', () => heicSample(), 'heic'],
      ['HEIF (declared type)', 'image/heif', () => heicSample(), 'heic'],
    ])('accepts a %s and stores it as WebP', async (_name, contentType, body, format) => {
      const res = await upload(admin, body(), contentType);
      expect(res.status).toBe(201);
      expect(res.body.data.contentType).toBe('image/webp');
      expect(res.body.data.source.format).toBe(format);
      expect(res.body.data.imageKey).toMatch(KEY_PATTERN);
    });

    it('looks at the content: the declared type is not what decides', async () => {
      // A JPEG sent as image/png is harmless: it is decoded and re-encoded either way.
      const res = await upload(admin, jpeg, 'image/png');
      expect(res.status).toBe(201);
      expect(res.body.data.source.format).toBe('jpeg');
    });

    it.each([
      ['a GIF named image/png', GIF_BYTES, 'image/png', /is a GIF/],
      [
        'an SVG named image/png',
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'),
        'image/png',
        /is an SVG/,
      ],
      ['an HTML page named image/jpeg', HTML_BYTES, 'image/jpeg', /not a JPEG, PNG, WebP or HEIC/],
      [
        'text named image/png',
        Buffer.from('this is not an image'),
        'image/png',
        /not a JPEG, PNG, WebP or HEIC/,
      ],
    ])('refuses %s with 422', async (_name, body, contentType, message) => {
      const res = await upload(admin, body, contentType);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('INVALID_IMAGE');
      expect(res.body.error.message).toMatch(message);
      expect(store.puts).toBe(0);
    });

    it('refuses an empty body (422)', async () => {
      const res = await upload(admin, Buffer.alloc(0));
      expect(res.status).toBe(422);
      expect(store.puts).toBe(0);
    });

    it('refuses a truncated image (422)', async () => {
      const res = await upload(admin, png.subarray(0, png.length - 15));
      expect(res.status).toBe(422);
      expect(res.body.error.message).toMatch(/damaged or incomplete/);
      expect(store.puts).toBe(0);
    });

    it('refuses a file with a perfect header but no real picture inside (422): a header is not enough', async () => {
      const res = await upload(admin, makePng({ width: 640, height: 360 })); // stub pixel data
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('INVALID_IMAGE');
      expect(store.puts).toBe(0);
    });

    it('refuses a picture wider than 8192 px (422), naming the limit', async () => {
      const res = await upload(admin, makePng({ width: 8193, height: 10 }));
      expect(res.status).toBe(422);
      expect(res.body.error.message).toContain('8192 px');
      expect(store.puts).toBe(0);
    });

    it('refuses an animated image (422)', async () => {
      const res = await upload(admin, await animatedWebp(), 'image/webp');
      expect(res.status).toBe(422);
      expect(res.body.error.message).toMatch(/Animated images are not supported/);
      expect(store.puts).toBe(0);
    });

    it('refuses a damaged HEIC (422)', async () => {
      const heic = heicSample();
      const res = await upload(admin, heic.subarray(0, Math.floor(heic.length / 2)), 'image/heic');
      expect(res.status).toBe(422);
      expect(store.puts).toBe(0);
    });

    it('turns HEIC away with 415 when HEIC is switched off (IMAGE_HEIC_ENABLED=false), but still takes the others', async () => {
      const localStore = new FakeImageStore();
      const noHeic = await createTestContext(
        { ...R2_ENV, IMAGE_HEIC_ENABLED: 'false' },
        { pushSender: new FakeSender(), imageStore: localStore },
      );
      try {
        const auth = await login(noHeic.app, await seedUser(noHeic.db.pool, { role: 'admin' }));
        const refused = await request(noHeic.app)
          .post(IMAGES)
          .set(auth.auth)
          .set('Content-Type', 'image/heic')
          .send(heicSample());
        expect(refused.status).toBe(415);
        expect(refused.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
        expect(refused.body.error.message).toMatch(/HEIC images are not enabled/);
        expect(localStore.puts).toBe(0);

        const accepted = await request(noHeic.app)
          .post(IMAGES)
          .set(auth.auth)
          .set('Content-Type', 'image/png')
          .send(png);
        expect(accepted.status).toBe(201);
      } finally {
        await noHeic.close();
      }
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('size limit (10 MB)', () => {
    it('is 10 MiB', () => {
      expect(IMAGE_UPLOAD_MAX_BYTES).toBe(10 * 1_048_576);
    });

    it('accepts a real picture of exactly 10 MiB', async () => {
      const exact = padPng(png, IMAGE_UPLOAD_MAX_BYTES);
      expect(exact.length).toBe(IMAGE_UPLOAD_MAX_BYTES);
      const res = await upload(admin, exact);
      expect(res.status).toBe(201);
      expect(res.body.data.source.bytes).toBe(IMAGE_UPLOAD_MAX_BYTES);
      // What is stored is the small converted copy, not 10 MB.
      expect(res.body.data.sizeBytes).toBeLessThan(100_000);
    });

    it('accepts a file well over the old 1 MB limit (the JSON BODY_LIMIT does not apply to uploads)', async () => {
      const res = await upload(admin, padPng(png, 3 * 1_048_576));
      expect(res.status).toBe(201);
    });

    it('refuses a file one byte over 10 MiB with a readable 413, not a dropped connection', async () => {
      const res = await upload(admin, padPng(png, IMAGE_UPLOAD_MAX_BYTES + 1));
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
      expect(res.body.error.message).toMatch(/10 MB/);
      expect(store.puts).toBe(0);
    });

    it('refuses a much larger file with a readable 413', async () => {
      const res = await upload(admin, Buffer.alloc(25 * 1_048_576, 7));
      expect(res.status).toBe(413);
      expect(store.puts).toBe(0);
    });

    it('refuses an oversized body that declares no length (chunked), reading it all and answering 413', async () => {
      const server = ctx.app.listen(0, '127.0.0.1');
      await new Promise<void>((resolve) => server.once('listening', resolve));
      try {
        const { port } = server.address() as AddressInfo;
        const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
          const req = http.request(
            {
              host: '127.0.0.1',
              port,
              path: IMAGES,
              method: 'POST',
              headers: {
                ...admin.auth,
                'Content-Type': 'image/png',
                'Transfer-Encoding': 'chunked',
              },
            },
            (res) => {
              let body = '';
              res.on('data', (chunk: Buffer) => {
                body += chunk.toString();
              });
              res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
            },
          );
          req.on('error', reject);
          const chunk = Buffer.alloc(256 * 1024, 7);
          for (let i = 0; i < 44; i += 1) req.write(chunk); // 11 MiB, no Content-Length
          req.end();
        });
        expect(result.status).toBe(413);
        expect(JSON.parse(result.body).error.code).toBe('PAYLOAD_TOO_LARGE');
        expect(store.puts).toBe(0);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('a successful upload', () => {
    it('stores a WebP and its push JPEG under onusfit/notifications/ with a random name, and answers with the key and URL', async () => {
      const res = await upload(admin, png);
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const { imageKey, imageUrl, contentType, sizeBytes, width, height, source } = res.body.data as Record<
        string,
        unknown
      >;
      expect(imageKey).toMatch(KEY_PATTERN);
      expect(imageUrl).toBe(`${ORIGIN}/${imageKey as string}`);
      expect(contentType).toBe('image/webp');
      expect([width, height]).toEqual([640, 360]);
      expect(source).toEqual({ format: 'png', bytes: png.length, width: 640, height: 360 });

      expect(store.puts).toBe(2);
      // Written in this order: the JPEG first, the key a notification stores last.
      expect([...store.objects.keys()]).toEqual([pushKeyOf(imageKey as string), imageKey]);
      const webpObject = store.objects.get(imageKey as string)!;
      expect(webpObject.contentType).toBe('image/webp');
      expect(webpObject.cacheControl).toBe('public, max-age=31536000, immutable');
      expect(sizeBytes).toBe(webpObject.body.byteLength);
      const pushObject = store.objects.get(pushKeyOf(imageKey as string))!;
      expect(pushObject.contentType).toBe('image/jpeg');
      expect(pushObject.cacheControl).toBe('public, max-age=31536000, immutable');
    });

    it('stores real, decodable images of the right formats and size, not the uploaded bytes', async () => {
      const { imageKey } = await uploadPng();
      const webpMeta = await storedMeta(imageKey);
      expect(webpMeta).toMatchObject({ format: 'webp', width: 640, height: 360 });
      expect(await storedMeta(pushKeyOf(imageKey))).toMatchObject({
        format: 'jpeg',
        width: 640,
        height: 360,
      });
      expect(Buffer.from(store.objects.get(imageKey)!.body).equals(png)).toBe(false);
    });

    it('scales a 12-megapixel photo down to 1440 px on its long side, keeping its proportions', async () => {
      const photo = await realJpeg({ width: 4000, height: 3000 });
      const res = await upload(admin, photo, 'image/jpeg');
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        width: 1440,
        height: 1080,
        source: { format: 'jpeg', width: 4000, height: 3000, bytes: photo.length },
      });
      expect(await storedMeta(res.body.data.imageKey as string)).toMatchObject({ width: 1440, height: 1080 });
    });

    it('converts a HEIC photo end to end (WebAssembly decoder, real container)', async () => {
      const res = await upload(admin, heicSample(), 'image/heic');
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ contentType: 'image/webp', width: 96, height: 64 });
      expect(await storedMeta(res.body.data.imageKey as string)).toMatchObject({
        format: 'webp',
        width: 96,
        height: 64,
      });
      expect(await storedMeta(pushKeyOf(res.body.data.imageKey as string))).toMatchObject({ format: 'jpeg' });
    });

    it('removes EXIF, including GPS and camera details, from everything stored', async () => {
      const withGps = await realJpeg({ width: 400, height: 300, exif: true });
      expect((await sharp(withGps).metadata()).exif).toBeDefined();
      const res = await upload(admin, withGps, 'image/jpeg');
      expect(res.status).toBe(201);
      for (const object of store.objects.values()) {
        const body = Buffer.from(object.body);
        expect((await sharp(body).metadata()).exif).toBeUndefined();
        expect(body.includes(Buffer.from('PrivateCameraMaker'))).toBe(false);
      }
    });

    it('gives the same file a new name every time', async () => {
      const a = await upload(admin, png);
      const b = await upload(admin, png);
      expect(a.body.data.imageKey).not.toBe(b.body.data.imageKey);
      expect(store.objects.size).toBe(4); // two images, each a WebP and a JPEG
    });

    it('accepts Content-Type with parameters and any capitalisation', async () => {
      const res = await upload(admin, png, 'IMAGE/PNG; charset=binary');
      expect(res.status).toBe(201);
    });

    it('records who uploaded what in the audit log, with sizes and no URL', async () => {
      const res = await upload(admin, png);
      const { rows } = await pool().query<{ action: string; details: Record<string, unknown> }>(
        "SELECT action, details FROM admin_audit_logs WHERE action = 'notification.image_upload'",
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.details).toMatchObject({
        imageKey: res.body.data.imageKey,
        sourceFormat: 'png',
        sourceBytes: png.length,
        sourceWidth: 640,
        sourceHeight: 360,
        storedBytes: res.body.data.sizeBytes,
        width: 640,
        height: 360,
      });
      expect(JSON.stringify(rows[0]!.details)).not.toContain('http');
    });

    it('never puts a credential in any response, and never lets the client choose the name', async () => {
      const res = await upload(admin, png);
      const text = JSON.stringify(res.body) + JSON.stringify(res.headers);
      for (const secret of [R2_ENV.R2_SECRET_ACCESS_KEY, R2_ENV.R2_ACCESS_KEY_ID, R2_ENV.R2_ACCOUNT_ID]) {
        expect(text).not.toContain(secret);
      }
      // A client-supplied name (header, query or path trick) has no effect on the key.
      const sneaky = await api()
        .post(`${IMAGES}?key=../../etc/passwd&name=evil`)
        .set(admin.auth)
        .set('Content-Type', 'image/png')
        .set('X-Object-Key', 'onusfit/notifications/chosen-by-client.webp')
        .send(png);
      expect(sneaky.status).toBe(201);
      expect(sneaky.body.data.imageKey).toMatch(KEY_PATTERN);
      expect([...store.objects.keys()].every((key) => key.startsWith('onusfit/notifications/'))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('when storage fails or is not configured', () => {
    it('answers 503 without details when R2 rejects the write, and records no audit entry', async () => {
      store.failPut = true;
      const res = await upload(admin, png);
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('IMAGE_STORAGE_UNAVAILABLE');
      expect(JSON.stringify(res.body)).not.toContain('HTTP 500');
      const { rows } = await pool().query(
        "SELECT 1 FROM admin_audit_logs WHERE action = 'notification.image_upload'",
      );
      expect(rows).toHaveLength(0);
    });

    it('leaves nothing a notification could use when only the final WebP write fails', async () => {
      store.failPutWhen = (key) => key.endsWith('.webp');
      const res = await upload(admin, png);
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('IMAGE_STORAGE_UNAVAILABLE');
      // Only the unreferenced push JPEG was written: there is no key a campaign could save, and nothing to dispatch.
      expect([...store.objects.keys()]).toHaveLength(1);
      expect([...store.objects.keys()][0]).toMatch(/\.push\.jpg$/);
      const { rows } = await pool().query(
        "SELECT 1 FROM admin_audit_logs WHERE action = 'notification.image_upload'",
      );
      expect(rows).toHaveLength(0);
    });

    it('answers 503 IMAGE_STORAGE_NOT_CONFIGURED when R2 is not configured, and text notifications still work', async () => {
      const bare = await createTestContext({}, { pushSender: new FakeSender() });
      try {
        const adminAuth = await login(bare.app, await seedUser(bare.db.pool, { role: 'admin' }));
        const target = await seedUser(bare.db.pool);

        const refused = await request(bare.app)
          .post(IMAGES)
          .set(adminAuth.auth)
          .set('Content-Type', 'image/png')
          .send(png);
        expect(refused.status).toBe(503);
        expect(refused.body.error.code).toBe('IMAGE_STORAGE_NOT_CONFIGURED');

        const withImage = await request(bare.app)
          .post(NOTIFICATIONS)
          .set(adminAuth.auth)
          .send({
            ...content({ audience: { type: 'users', userIds: [target.id] } }),
            imageKey: MISSING_KEY,
            mode: 'draft',
          });
        expect(withImage.status).toBe(503);
        expect(withImage.body.error.code).toBe('IMAGE_STORAGE_NOT_CONFIGURED');

        const textOnly = await request(bare.app)
          .post(NOTIFICATIONS)
          .set(adminAuth.auth)
          .send({ ...content({ audience: { type: 'users', userIds: [target.id] } }), mode: 'draft' });
        expect(textOnly.status).toBe(201);
        expect(textOnly.body.data).toMatchObject({ imageKey: null, imageUrl: null });
      } finally {
        await bare.close();
      }
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('attaching an image to a notification', () => {
    it('saves the key on a draft and returns the derived public URL of the WebP', async () => {
      const { imageKey, imageUrl } = await uploadPng();
      const res = await draft({ imageKey });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ imageKey, imageUrl });
      expect(imageUrl).toBe(`${ORIGIN}/${imageKey}`);

      const { rows } = await pool().query<{ image_key: string }>(
        'SELECT image_key FROM notification_campaigns WHERE id = $1',
        [res.body.data.id],
      );
      expect(rows[0]!.image_key).toBe(imageKey);
    });

    it('stores only the key, never a URL', async () => {
      const { imageKey } = await uploadPng();
      const res = await draft({ imageKey });
      const { rows } = await pool().query<Record<string, unknown>>(
        'SELECT * FROM notification_campaigns WHERE id = $1',
        [res.body.data.id],
      );
      expect(JSON.stringify(rows[0])).not.toContain('http');
    });

    it('still accepts a key written before the image policy, so existing campaigns remain valid and editable', async () => {
      const res = await draft({ imageKey: LEGACY_KEY });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ imageKey: LEGACY_KEY, imageUrl: `${ORIGIN}/${LEGACY_KEY}` });
    });

    it.each([
      ['an external URL as the key', { imageKey: 'https://evil.example/pixel.png' }],
      ['the media URL as the key', { imageKey: `${ORIGIN}/${MISSING_KEY}` }],
      ['a path traversal', { imageKey: 'onusfit/notifications/../../etc/passwd' }],
      ['another prefix', { imageKey: 'uploads/0123456789abcdef0123456789abcdef.png' }],
      [
        'another feature under onusfit/',
        { imageKey: 'onusfit/exercises/0123456789abcdef0123456789abcdef.webp' },
      ],
      [
        'the push JPEG derivative (it is not a key a notification stores)',
        { imageKey: 'onusfit/notifications/0123456789abcdef0123456789abcdef.push.jpg' },
      ],
      [
        'a canonical name with a PNG extension',
        { imageKey: 'onusfit/notifications/0123456789abcdef0123456789abcdef.png' },
      ],
      [
        'a legacy name with a WebP extension',
        { imageKey: 'notifications/0123456789abcdef0123456789abcdef.webp' },
      ],
      ['an unsupported extension', { imageKey: 'notifications/0123456789abcdef0123456789abcdef.gif' }],
      ['a short key', { imageKey: 'onusfit/notifications/abc.webp' }],
      ['a non-string key', { imageKey: 42 }],
      ['an imageUrl field', { imageUrl: 'https://evil.example/pixel.png' }],
      ['an image field', { image: 'https://evil.example/pixel.png' }],
      [
        'an imageUrl alongside a valid key',
        { imageKey: MISSING_KEY, imageUrl: 'https://evil.example/x.png' },
      ],
    ])('rejects %s (400), saving nothing', async (_name, extra) => {
      const res = await draft(extra);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      const { rows } = await pool().query('SELECT 1 FROM notification_campaigns');
      expect(rows).toHaveLength(0);
    });

    it('rejects external image addresses on preview and on edit too', async () => {
      const preview = await api()
        .post(`${NOTIFICATIONS}/preview`)
        .set(admin.auth)
        .send(content({ imageUrl: 'https://evil.example/pixel.png' }));
      expect(preview.status).toBe(400);

      const created = await draft();
      const edit = await api()
        .patch(`${NOTIFICATIONS}/${created.body.data.id as string}`)
        .set(admin.auth)
        .send({ ...content(), version: 1, imageKey: 'https://evil.example/pixel.png' });
      expect(edit.status).toBe(400);
    });

    it('lets a member do none of this', async () => {
      const { imageKey } = await uploadPng();
      const res = await api()
        .post(NOTIFICATIONS)
        .set(member.auth.auth)
        .send({ ...content(), imageKey, mode: 'draft' });
      expect(res.status).toBe(403);
    });

    it('shows on the preview step the JPEG the phone will receive, after checking the pair exists', async () => {
      const { imageKey, imageUrl } = await uploadPng();
      const res = await api().post(`${NOTIFICATIONS}/preview`).set(admin.auth).send(content({ imageKey }));
      expect(res.status).toBe(200);
      expect(res.body.data.push).toMatchObject({
        title: 'New challenge',
        imageUrl: `${ORIGIN}/${pushKeyOf(imageKey)}`,
      });
      // The stored WebP is what the list and detail show; the push carries the JPEG next to it.
      expect(res.body.data.push.imageUrl).not.toBe(imageUrl);
    });

    it('fails the preview when the image is not in storage', async () => {
      const res = await api()
        .post(`${NOTIFICATIONS}/preview`)
        .set(admin.auth)
        .send(content({ imageKey: MISSING_KEY }));
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('IMAGE_NOT_FOUND');
    });

    it('fails the preview when only the push JPEG is missing (a half-written pair)', async () => {
      const { imageKey } = await uploadPng();
      store.objects.delete(pushKeyOf(imageKey));
      const res = await api().post(`${NOTIFICATIONS}/preview`).set(admin.auth).send(content({ imageKey }));
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('IMAGE_NOT_FOUND');
    });

    it('lists and fetches campaigns with their image URLs', async () => {
      const { imageKey, imageUrl } = await uploadPng();
      const withImage = await draft({ imageKey });
      const textOnly = await draft({ title: 'Plain' });

      const list = await api().get(NOTIFICATIONS).set(admin.auth);
      const byId = new Map<string, { imageKey: string | null; imageUrl: string | null }>(
        (list.body.data as { id: string; imageKey: string | null; imageUrl: string | null }[]).map((c) => [
          c.id,
          c,
        ]),
      );
      expect(byId.get(withImage.body.data.id as string)).toMatchObject({ imageKey, imageUrl });
      expect(byId.get(textOnly.body.data.id as string)).toMatchObject({ imageKey: null, imageUrl: null });

      const one = await api()
        .get(`${NOTIFICATIONS}/${withImage.body.data.id as string}`)
        .set(admin.auth);
      expect(one.body.data).toMatchObject({ imageKey, imageUrl });
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('replacing and removing the image on a draft', () => {
    it('replaces it, then removes it, bumping the version each time', async () => {
      const first = await uploadPng();
      const created = await draft({ imageKey: first.imageKey });
      const id = created.body.data.id as string;

      const second = await uploadPng();
      const replaced = await api()
        .patch(`${NOTIFICATIONS}/${id}`)
        .set(admin.auth)
        .send({ ...content(), imageKey: second.imageKey, version: 1 });
      expect(replaced.status).toBe(200);
      expect(replaced.body.data).toMatchObject({
        imageKey: second.imageKey,
        imageUrl: second.imageUrl,
        version: 2,
      });

      const removed = await api()
        .patch(`${NOTIFICATIONS}/${id}`)
        .set(admin.auth)
        .send({ ...content(), imageKey: null, version: 2 });
      expect(removed.status).toBe(200);
      expect(removed.body.data).toMatchObject({ imageKey: null, imageUrl: null, version: 3 });

      const { rows } = await pool().query<{ image_key: string | null }>(
        'SELECT image_key FROM notification_campaigns WHERE id = $1',
        [id],
      );
      expect(rows[0]!.image_key).toBeNull();
    });

    it('treats an edit with no image field as removing the image (an edit replaces the whole draft)', async () => {
      const { imageKey } = await uploadPng();
      const created = await draft({ imageKey });
      const edited = await api()
        .patch(`${NOTIFICATIONS}/${created.body.data.id as string}`)
        .set(admin.auth)
        .send({ ...content(), version: 1 });
      expect(edited.status).toBe(200);
      expect(edited.body.data.imageKey).toBeNull();
    });

    it('replaces a legacy image with a new one: the old file is left alone', async () => {
      const created = await draft({ imageKey: LEGACY_KEY });
      store.objects.set(LEGACY_KEY, { body: png, contentType: 'image/png', cacheControl: undefined });
      const next = await uploadPng();
      const edited = await api()
        .patch(`${NOTIFICATIONS}/${created.body.data.id as string}`)
        .set(admin.auth)
        .send({ ...content(), imageKey: next.imageKey, version: 1 });
      expect(edited.status).toBe(200);
      expect(edited.body.data).toMatchObject({ imageKey: next.imageKey, imageUrl: next.imageUrl });
      expect(store.objects.has(LEGACY_KEY)).toBe(true);
    });

    it('does not delete any stored file when the image is replaced or removed (it may be in use)', async () => {
      const first = await uploadPng();
      const created = await draft({ imageKey: first.imageKey });
      await api()
        .patch(`${NOTIFICATIONS}/${created.body.data.id as string}`)
        .set(admin.auth)
        .send({ ...content(), imageKey: null, version: 1 });
      expect(store.objects.has(first.imageKey)).toBe(true);
      expect(store.objects.has(pushKeyOf(first.imageKey))).toBe(true);
    });

    it('keeps optimistic locking: a stale edit is refused and the image is unchanged', async () => {
      const first = await uploadPng();
      const created = await draft({ imageKey: first.imageKey });
      const id = created.body.data.id as string;
      const second = await uploadPng();
      const stale = await api()
        .patch(`${NOTIFICATIONS}/${id}`)
        .set(admin.auth)
        .send({ ...content(), imageKey: second.imageKey, version: 99 });
      expect(stale.status).toBe(409);
      const { rows } = await pool().query<{ image_key: string }>(
        'SELECT image_key FROM notification_campaigns WHERE id = $1',
        [id],
      );
      expect(rows[0]!.image_key).toBe(first.imageKey);
    });

    it('cannot change the image once the notification has been scheduled', async () => {
      const first = await uploadPng();
      const scheduled = await schedule({ imageKey: first.imageKey });
      expect(scheduled.status).toBe(201);
      const second = await uploadPng();
      const edit = await api()
        .patch(`${NOTIFICATIONS}/${scheduled.body.data.id as string}`)
        .set(admin.auth)
        .send({ ...content(), imageKey: second.imageKey, version: scheduled.body.data.version });
      expect(edit.status).toBe(409);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('launching', () => {
    it('queues a notification whose image exists, and audits it', async () => {
      const { imageKey } = await uploadPng();
      const res = await schedule({ imageKey });
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('scheduled');
      const { rows } = await pool().query<{ details: { hasImage: boolean } }>(
        "SELECT details FROM admin_audit_logs WHERE action = 'notification.schedule'",
      );
      expect(rows[0]!.details.hasImage).toBe(true);
    });

    it('refuses to queue an image that is not in storage (422), creating nothing', async () => {
      const res = await schedule({ imageKey: MISSING_KEY });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('IMAGE_NOT_FOUND');
      expect((await pool().query('SELECT 1 FROM notification_campaigns')).rows).toHaveLength(0);
    });

    it('refuses to queue when the push JPEG is missing although the WebP is there (422), creating nothing', async () => {
      const { imageKey } = await uploadPng();
      store.objects.delete(pushKeyOf(imageKey));
      const res = await schedule({ imageKey });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('IMAGE_NOT_FOUND');
      expect((await pool().query('SELECT 1 FROM notification_campaigns')).rows).toHaveLength(0);
    });

    it('refuses with 503 when storage cannot be checked, creating nothing', async () => {
      const { imageKey } = await uploadPng();
      store.failExists = true;
      const res = await schedule({ imageKey });
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('IMAGE_STORAGE_UNAVAILABLE');
      expect((await pool().query('SELECT 1 FROM notification_campaigns')).rows).toHaveLength(0);
    });

    it('queues a legacy-keyed notification when its one file exists, and refuses when it does not', async () => {
      const refused = await schedule({ imageKey: LEGACY_KEY });
      expect(refused.status).toBe(422);
      store.objects.set(LEGACY_KEY, { body: png, contentType: 'image/png', cacheControl: undefined });
      const accepted = await schedule({ imageKey: LEGACY_KEY });
      expect(accepted.status).toBe(201);
    });

    it('sending a saved draft checks its image too', async () => {
      const { imageKey } = await uploadPng();
      const created = await draft({ imageKey });
      store.objects.delete(imageKey); // the file disappears between saving and sending
      const send = await api()
        .post(`${NOTIFICATIONS}/${created.body.data.id as string}/send`)
        .set(admin.auth)
        .send({ scheduledAt: new Date(Date.now() + 3_600_000).toISOString() });
      expect(send.status).toBe(422);
      expect(send.body.error.code).toBe('IMAGE_NOT_FOUND');
      const { rows } = await pool().query<{ status: string }>('SELECT status FROM notification_campaigns');
      expect(rows[0]!.status).toBe('draft');
    });

    it('replays an identical create with an image instead of queueing a second campaign', async () => {
      const { imageKey } = await uploadPng();
      const body = {
        ...content(),
        imageKey,
        mode: 'schedule',
        scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
      };
      const first = await api()
        .post(NOTIFICATIONS)
        .set(admin.auth)
        .set('Idempotency-Key', 'image-key-0001')
        .send(body);
      const second = await api()
        .post(NOTIFICATIONS)
        .set(admin.auth)
        .set('Idempotency-Key', 'image-key-0001')
        .send(body);
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.headers['idempotent-replayed']).toBe('true');
      expect(second.body.data.id).toBe(first.body.data.id);
      expect((await pool().query('SELECT 1 FROM notification_campaigns')).rows).toHaveLength(1);
    });

    it('refuses to reuse an idempotency key for a different image', async () => {
      const a = await uploadPng();
      const b = await uploadPng();
      const at = new Date(Date.now() + 3_600_000).toISOString();
      const first = await api()
        .post(NOTIFICATIONS)
        .set(admin.auth)
        .set('Idempotency-Key', 'image-key-0002')
        .send({ ...content(), imageKey: a.imageKey, mode: 'schedule', scheduledAt: at });
      const second = await api()
        .post(NOTIFICATIONS)
        .set(admin.auth)
        .set('Idempotency-Key', 'image-key-0002')
        .send({ ...content(), imageKey: b.imageKey, mode: 'schedule', scheduledAt: at });
      expect(first.status).toBe(201);
      expect(second.status).toBe(422);
      expect(second.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      expect((await pool().query('SELECT 1 FROM notification_campaigns')).rows).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('what reaches the push provider (a fake: no real notification is ever sent)', () => {
    it('carries the JPEG derivative URL, never the WebP, built from the stored key and the trusted media origin', async () => {
      await registerDevice();
      const { imageKey } = await uploadPng();
      const created = await schedule({ imageKey });
      expect(await runCampaign(created.body.data.id as string)).toBe('sent');

      expect(sender.sent).toHaveLength(1);
      expect(sender.sent[0]!.imageUrl).toBe(`${ORIGIN}/${pushKeyOf(imageKey)}`);
      expect(sender.sent[0]!.imageUrl).toMatch(/\.push\.jpg$/);
      expect(sender.sent[0]!.title).toBe('New challenge');
      // Existing contract is untouched: only opaque ids in data, and the image is not smuggled into it.
      expect(Object.keys(sender.sent[0]!.data).sort()).toEqual(['category', 'destination', 'notificationId']);
    });

    it('sends a notification saved with a legacy key at its original URL, unchanged', async () => {
      await registerDevice();
      store.objects.set(LEGACY_KEY, { body: png, contentType: 'image/png', cacheControl: undefined });
      const { rows } = await pool().query<{ id: string }>(
        `INSERT INTO notification_campaigns
           (created_by, title, body, category, destination, audience_type, audience_user_ids, status, scheduled_at, image_key)
         VALUES ($1, 'Legacy picture', 'Saved before the image policy', 'announcements', 'home', 'users',
                 ARRAY[$2]::uuid[], 'scheduled', now() - interval '1 minute', $3)
         RETURNING id`,
        [adminUser.id, member.user.id, LEGACY_KEY],
      );
      expect(await runCampaign(rows[0]!.id)).toBe('sent');
      expect(sender.sent).toHaveLength(1);
      expect(sender.sent[0]!.imageUrl).toBe(`${ORIGIN}/${LEGACY_KEY}`);
    });

    it('sends a text-only notification with no image at all (backward compatible)', async () => {
      await registerDevice();
      const created = await schedule();
      expect(await runCampaign(created.body.data.id as string)).toBe('sent');
      expect(sender.sent).toHaveLength(1);
      expect(sender.sent[0]).not.toHaveProperty('imageUrl');
    });

    it('sends the image notification to every device, and stays idempotent on re-dispatch', async () => {
      await registerDevice();
      const { imageKey } = await uploadPng();
      const created = await schedule({ imageKey });
      const id = created.body.data.id as string;
      await runCampaign(id);
      await dispatcher().runOnce();
      await dispatcher().runOnce();
      expect(sender.sent).toHaveLength(1); // one device, sent once
    });

    it('keeps the inbox item text-only (the image is a push-time extra)', async () => {
      await registerDevice();
      const { imageKey } = await uploadPng();
      const created = await schedule({ imageKey });
      await runCampaign(created.body.data.id as string);
      const inbox = await api().get('/api/v1/notifications').set(member.auth.auth);
      expect(inbox.status).toBe(200);
      const item = (inbox.body.data.items as Record<string, unknown>[])[0]!;
      expect(item).toMatchObject({ title: 'New challenge' });
      expect(item).not.toHaveProperty('imageKey');
      expect(item).not.toHaveProperty('imageUrl');
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('API documentation', () => {
    it('lists the upload route in the OpenAPI document, describing the accepted formats and limits', async () => {
      const res = await api().get('/api/v1/openapi.json');
      expect(res.status).toBe(200);
      const paths = res.body.paths as Record<
        string,
        Record<string, { summary: string; description?: string }>
      >;
      const route = paths['/api/v1/admin/notifications/images']?.post;
      expect(route?.summary).toMatch(/upload an image/i);
      expect(route?.description).toMatch(/image\/webp/);
      expect(route?.description).toMatch(/image\/heic/);
      expect(route?.description).toMatch(/10 MB/);
    });
  });
});
