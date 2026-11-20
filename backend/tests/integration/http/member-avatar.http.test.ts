import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { IMAGE_UPLOAD_MAX_BYTES } from '../../../src/shared/images/image-policy.js';
import {
  isOwnedPrivateImageKey,
  privateThumbnailKey,
} from '../../../src/shared/private-media/private-image-policy.js';
import { GIF_BYTES, heicSample, makeJpeg, realJpeg, realPng, realWebp } from '../../helpers/images.js';
import { keyOfFakeUrl } from '../../helpers/fake-private-store.js';
import {
  createPrivateMediaTestContext,
  type PrivateMediaTestContext,
} from '../../helpers/private-media-app.js';

const PATH = '/api/v1/profile/avatar';

let ctx: PrivateMediaTestContext;
beforeAll(async () => {
  ctx = await createPrivateMediaTestContext();
}, 180_000);
afterAll(async () => {
  await ctx?.close();
});
beforeEach(async () => {
  ctx.setNow(new Date('2026-11-20T12:00:00Z'));
  await ctx.media.purger.drain(); // let a previous test's background deletion finish first
  ctx.store.objects.clear();
  ctx.store.calls.length = 0;
  await ctx.db.pool.query('TRUNCATE private_media_deletions');
});

/** Waits for the background deletion worker (kicked after a commit) to finish what it was handed. */
const settled = async () => {
  await ctx.media.purger.drain();
  await vi.waitFor(async () => expect(await ctx.media.deletionQueue.pendingCount()).toBe(0));
};

const upload = (userId: string, body: Buffer | Uint8Array, type = 'image/jpeg') =>
  ctx.as(userId).put(PATH).set('Content-Type', type).send(Buffer.from(body));

const storedMeta = (key: string) => sharp(Buffer.from(ctx.store.objects.get(key)!.body)).metadata();

describe('GET /profile/avatar', () => {
  it('answers null for a member with no picture', async () => {
    const { id } = await ctx.seedUser();
    const res = await ctx.as(id).get(PATH);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { avatar: null } });
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it('requires a signed-in member', async () => {
    const { id } = await ctx.seedUser();
    for (const call of [
      () => ctx.as('00000000-0000-4000-8000-000000000000').get(PATH),
      () => ctx.as(id).get(PATH).set('Authorization', 'Bearer'),
    ]) {
      expect((await call()).status).toBe(401);
    }
    const anonymous = await (await import('supertest')).default(ctx.app).get(PATH);
    expect(anonymous.status).toBe(401);
    expect(
      (
        await (
          await import('supertest')
        )
          .default(ctx.app)
          .put(PATH)
          .set('Content-Type', 'image/jpeg')
          .send(Buffer.from([1]))
      ).status,
    ).toBe(401);
    expect((await (await import('supertest')).default(ctx.app).delete(PATH)).status).toBe(401);
  });
});

describe('PUT /profile/avatar', () => {
  it('stores a square picture and its thumbnail privately and returns short-lived signed URLs', async () => {
    const { id } = await ctx.seedUser();
    const res = await upload(id, await realJpeg({ width: 3000, height: 2000 }));

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    const { avatar } = res.body.data;
    expect(avatar).toMatchObject({ width: 400, height: 400 });
    expect(avatar.version).toMatch(/^[0-9a-f]{32}$/);
    expect(avatar.expiresAt).toBe('2026-11-20T12:15:00.000Z');
    // No storage key, bucket or owner id is a field of its own: the URLs are all the app needs.
    expect(Object.keys(avatar).sort()).toEqual([
      'expiresAt',
      'height',
      'thumbnailUrl',
      'updatedAt',
      'url',
      'version',
      'width',
    ]);

    const key = keyOfFakeUrl(avatar.url);
    expect(isOwnedPrivateImageKey(key, id, 'avatar')).toBe(true);
    expect(keyOfFakeUrl(avatar.thumbnailUrl)).toBe(privateThumbnailKey(key));
    expect(ctx.store.keys).toEqual([key, privateThumbnailKey(key)].sort());

    const full = ctx.store.fetchSigned(avatar.url);
    expect(full.status).toBe(200);
    expect(await sharp(Buffer.from(full.body!)).metadata()).toMatchObject({
      format: 'webp',
      width: 400,
      height: 400,
    });
    expect(await storedMeta(privateThumbnailKey(key))).toMatchObject({
      format: 'webp',
      width: 128,
      height: 128,
    });
    for (const object of ctx.store.objects.values()) expect(object.cacheControl).toMatch(/^private,/);

    const row = await ctx.db.pool.query('SELECT user_id, object_key FROM member_avatars WHERE user_id = $1', [
      id,
    ]);
    expect(row.rows[0]).toEqual({ user_id: id, object_key: key });
  });

  it('is shown again by GET with fresh URLs, the same version, and nothing else changed', async () => {
    const { id } = await ctx.seedUser();
    const first = (await upload(id, await realPng({ width: 500, height: 500 }), 'image/png')).body.data
      .avatar;
    ctx.setNow(new Date('2026-11-20T12:10:00Z'));
    const again = (await ctx.as(id).get(PATH)).body.data.avatar;
    expect(again.version).toBe(first.version);
    expect(again.expiresAt).toBe('2026-11-20T12:25:00.000Z');
    expect(ctx.store.fetchSigned(again.url).status).toBe(200);
  });

  it.each([
    ['PNG', async () => realPng({ width: 300, height: 200 }), 'image/png'],
    ['WebP', async () => realWebp({ width: 300, height: 200 }), 'image/webp'],
    ['HEIC', async () => heicSample(), 'image/heic'],
  ])('accepts a %s photo', async (_name, make, type) => {
    const { id } = await ctx.seedUser();
    const res = await upload(id, await make(), type);
    expect(res.status).toBe(200);
    expect(ctx.store.keys).toHaveLength(2);
  });

  it('strips EXIF, GPS and camera details from everything it stores', async () => {
    const { id } = await ctx.seedUser();
    await upload(id, await realJpeg({ exif: true, width: 800, height: 600 }));
    for (const [key, object] of ctx.store.objects) {
      const meta = await storedMeta(key);
      expect(meta.exif, key).toBeUndefined();
      const text = Buffer.from(object.body).toString('latin1');
      for (const marker of ['Exif', 'GPS', 'PrivateCameraMaker', 'PrivateModel'])
        expect(text.includes(marker)).toBe(false);
    }
  });

  describe('replacing', () => {
    it('stores under a NEW key and version, and removes the old picture and thumbnail from storage', async () => {
      const { id } = await ctx.seedUser();
      const first = (await upload(id, await realPng({ width: 500, height: 500 }), 'image/png')).body.data
        .avatar;
      const oldKeys = [keyOfFakeUrl(first.url), keyOfFakeUrl(first.thumbnailUrl)];

      const second = (
        await upload(
          id,
          await realPng({ width: 500, height: 500, color: { r: 10, g: 20, b: 200 } }),
          'image/png',
        )
      ).body.data.avatar;
      await settled();

      expect(second.version).not.toBe(first.version); // what makes client caches safe
      expect(keyOfFakeUrl(second.url)).not.toBe(keyOfFakeUrl(first.url));
      expect(ctx.store.keys).toEqual([keyOfFakeUrl(second.url), keyOfFakeUrl(second.thumbnailUrl)].sort());
      for (const old of oldKeys) expect(ctx.store.objects.has(old)).toBe(false);
      // The old signed URL no longer shows anything.
      expect(ctx.store.fetchSigned(first.url)).toMatchObject({ status: 404 });
      const rows = await ctx.db.pool.query('SELECT object_key FROM member_avatars WHERE user_id = $1', [id]);
      expect(rows.rows).toEqual([{ object_key: keyOfFakeUrl(second.url) }]);
    });

    it('keeps the old picture queued, and retries, when storage cannot delete it yet', async () => {
      const { id } = await ctx.seedUser();
      const first = (await upload(id, await realPng({ width: 400, height: 400 }), 'image/png')).body.data
        .avatar;
      const oldKey = keyOfFakeUrl(first.url);

      ctx.store.failNext('delete', 2); // storage outage for exactly the two deletes the replacement triggers
      await upload(id, await realPng({ width: 400, height: 400 }), 'image/png');
      await vi.waitFor(async () => expect(ctx.store.count('delete')).toBeGreaterThanOrEqual(2));
      await ctx.media.purger.drain();

      // Not lost: both old objects are still stored AND still queued, with the failure counted.
      expect(ctx.store.objects.has(oldKey)).toBe(true);
      const queued = await ctx.db.pool.query<{ object_key: string; attempts: number }>(
        'SELECT object_key, attempts FROM private_media_deletions ORDER BY object_key',
      );
      expect(queued.rows.map((r) => r.object_key)).toEqual([oldKey, privateThumbnailKey(oldKey)].sort());
      expect(queued.rows.every((r) => r.attempts >= 1)).toBe(true);

      // Storage is back and the backoff has elapsed: the next pass removes them.
      await ctx.db.pool.query(`UPDATE private_media_deletions SET next_attempt_at = now()`);
      await settled();
      expect(ctx.store.objects.has(oldKey)).toBe(false);
    });

    it('leaves the old picture working when the new one cannot be stored', async () => {
      const { id } = await ctx.seedUser();
      const first = (await upload(id, await realPng({ width: 400, height: 400 }), 'image/png')).body.data
        .avatar;
      const before = ctx.store.keys;

      ctx.store.failNext('put', 1, (key) => !key.includes('.thumb')); // the picture itself fails after its thumbnail
      const failed = await upload(id, await realPng({ width: 400, height: 400 }), 'image/png');

      expect(failed.status).toBe(503);
      expect(failed.body.error.code).toBe('PRIVATE_STORAGE_UNAVAILABLE');
      expect(failed.body.error.message).not.toMatch(/503|bucket|r2|cloudflare/i);
      expect(ctx.store.keys).toEqual(before); // nothing new left behind
      expect((await ctx.as(id).get(PATH)).body.data.avatar.version).toBe(first.version);
      expect(await ctx.media.deletionQueue.pendingCount()).toBe(0);
    });

    it('removes what it stored, and keeps the old picture, when the database cannot save the row', async () => {
      const { id } = await ctx.seedUser();
      const first = (await upload(id, await realPng({ width: 400, height: 400 }), 'image/png')).body.data
        .avatar;
      const before = ctx.store.keys;

      await ctx.db.pool.query('ALTER TABLE member_avatars RENAME TO member_avatars_off');
      try {
        const failed = await upload(id, await realPng({ width: 400, height: 400 }), 'image/png');
        expect(failed.status).toBe(500);
      } finally {
        await ctx.db.pool.query('ALTER TABLE member_avatars_off RENAME TO member_avatars');
      }
      expect(ctx.store.keys).toEqual(before); // the freshly stored pair was removed again
      expect((await ctx.as(id).get(PATH)).body.data.avatar.version).toBe(first.version);
    });
  });

  describe('refusing bad uploads (nothing is stored, the current picture is untouched)', () => {
    it.each([
      ['an unsupported type', 'application/json', Buffer.from('{}'), 415, 'UNSUPPORTED_MEDIA_TYPE'],
      ['a GIF', 'image/jpeg', GIF_BYTES, 422, 'INVALID_IMAGE'],
      [
        'a damaged file with a valid header',
        'image/jpeg',
        makeJpeg({ width: 50, height: 50 }),
        422,
        'INVALID_IMAGE',
      ],
      ['an empty body', 'image/jpeg', Buffer.alloc(0), 422, 'INVALID_IMAGE'],
      [
        'text pretending to be a picture',
        'image/png',
        Buffer.from('<html>not an image</html>'),
        422,
        'INVALID_IMAGE',
      ],
    ])('%s', async (_name, type, body, status, code) => {
      const { id } = await ctx.seedUser();
      const res = await upload(id, body, type);
      expect(res.status).toBe(status);
      expect(res.body.error.code).toBe(code);
      expect(ctx.store.keys).toEqual([]);
      expect((await ctx.as(id).get(PATH)).body.data.avatar).toBeNull();
    });

    it('a file over 10 MiB is 413 without reading the body', async () => {
      const { id } = await ctx.seedUser();
      const big = Buffer.alloc(IMAGE_UPLOAD_MAX_BYTES + 1, 0xff);
      const res = await upload(id, big);
      expect(res.status).toBe(413);
      expect(ctx.store.keys).toEqual([]);
    });
  });

  it('applies the upload limiter before anything is read: a refused request never reaches the picture pipeline', async () => {
    const limited = await createPrivateMediaTestContext({
      limiters: (_req, res) => {
        res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'slow down' } });
      },
    });
    try {
      const { id } = await limited.seedUser();
      const res = await limited
        .as(id)
        .put(PATH)
        .set('Content-Type', 'image/png')
        .send(await realPng());
      expect(res.status).toBe(429);
      expect(limited.store.calls).toEqual([]);
      // Reading is not limited by the upload budget.
      expect((await limited.as(id).get(PATH)).status).toBe(200);
    } finally {
      await limited.close();
    }
  }, 120_000);
});

describe('DELETE /profile/avatar', () => {
  it('removes the picture, and its stored files, and is idempotent', async () => {
    const { id } = await ctx.seedUser();
    const { avatar } = (await upload(id, await realPng({ width: 400, height: 400 }), 'image/png')).body.data;

    const first = await ctx.as(id).delete(PATH);
    expect(first.status).toBe(200);
    expect(first.body.data).toEqual({ avatar: null });
    await settled();
    expect(ctx.store.keys).toEqual([]);
    expect(ctx.store.fetchSigned(avatar.url)).toMatchObject({ status: 404 });
    expect((await ctx.as(id).get(PATH)).body.data.avatar).toBeNull();

    expect((await ctx.as(id).delete(PATH)).status).toBe(200); // nothing to remove: still fine
  });
});

describe('ownership and privacy', () => {
  it("shows a member only their own picture, and a member's removal never touches anyone else's", async () => {
    const alice = await ctx.seedUser();
    const bob = await ctx.seedUser();
    const alicesAvatar = (await upload(alice.id, await realPng({ width: 400, height: 400 }), 'image/png'))
      .body.data.avatar;

    expect((await ctx.as(bob.id).get(PATH)).body.data.avatar).toBeNull();
    expect((await ctx.as(bob.id).delete(PATH)).status).toBe(200);
    await settled();
    expect((await ctx.as(alice.id).get(PATH)).body.data.avatar.version).toBe(alicesAvatar.version);
    expect(ctx.store.keys).toHaveLength(2);

    // Bob's own upload lands under Bob's id, never Alice's.
    const bobs = (await upload(bob.id, await realPng({ width: 300, height: 300 }), 'image/png')).body.data
      .avatar;
    expect(isOwnedPrivateImageKey(keyOfFakeUrl(bobs.url), bob.id, 'avatar')).toBe(true);
    expect(keyOfFakeUrl(bobs.url)).not.toContain(alice.id);
  });

  it('ignores any member id, path or key the request tries to name: the route has no such parameter', async () => {
    const alice = await ctx.seedUser();
    const bob = await ctx.seedUser();
    await upload(alice.id, await realPng({ width: 400, height: 400 }), 'image/png');
    const sneaky = await ctx
      .as(bob.id)
      .get(`${PATH}?userId=${alice.id}&key=members/${alice.id}/avatar/x.webp`);
    expect(sneaky.body.data.avatar).toBeNull();
    expect((await ctx.as(bob.id).get(`/api/v1/profile/avatar/${alice.id}`)).status).toBe(404);
  });

  it("never serves a signed URL for a row whose key is not the owner's (a corrupt row shows nothing)", async () => {
    const alice = await ctx.seedUser();
    const bob = await ctx.seedUser();
    await upload(alice.id, await realPng({ width: 400, height: 400 }), 'image/png');
    // Bypass the CHECK to simulate corruption: the second wall (the URL issuer) must still hold.
    await ctx.db.pool.query('ALTER TABLE member_avatars DROP CONSTRAINT member_avatars_object_key_valid');
    try {
      await ctx.db.pool.query(
        `INSERT INTO member_avatars (user_id, object_key, width, height, byte_size) VALUES ($1, $2, 400, 400, 1) ON CONFLICT (user_id) DO UPDATE SET object_key = EXCLUDED.object_key`,
        [bob.id, `members/${alice.id}/avatar/ffffffffffffffffffffffffffffffff.webp`],
      );
      ctx.store.calls.length = 0;
      expect((await ctx.as(bob.id).get(PATH)).body.data.avatar).toBeNull();
      expect(ctx.store.count('sign')).toBe(0); // nothing was even signed
    } finally {
      await ctx.db.pool.query('DELETE FROM member_avatars WHERE user_id = $1', [bob.id]);
      await ctx.db.pool.query(
        `ALTER TABLE member_avatars ADD CONSTRAINT member_avatars_object_key_valid CHECK (object_key ~ ('^members/' || user_id::text || '/avatar/[0-9a-f]{32}\\.webp$'))`,
      );
    }
  });

  it('answers with signed URLs that expire, and a refetch gives working ones (expired URL handling)', async () => {
    const { id } = await ctx.seedUser();
    const { avatar } = (await upload(id, await realPng({ width: 400, height: 400 }), 'image/png')).body.data;
    expect(ctx.store.fetchSigned(avatar.url).status).toBe(200);

    ctx.setNow(new Date('2026-11-20T12:15:00Z'));
    expect(ctx.store.fetchSigned(avatar.url)).toEqual({ status: 403, reason: 'expired' });
    const fresh = (await ctx.as(id).get(PATH)).body.data.avatar;
    expect(fresh.url).not.toBe(avatar.url);
    expect(fresh.version).toBe(avatar.version);
    expect(ctx.store.fetchSigned(fresh.url).status).toBe(200);
  });

  it('reports a picture whose file has gone missing as a 404 from storage (the app shows its placeholder), and can still remove it', async () => {
    const { id } = await ctx.seedUser();
    const { avatar } = (await upload(id, await realPng({ width: 400, height: 400 }), 'image/png')).body.data;
    ctx.store.objects.delete(keyOfFakeUrl(avatar.url)); // lost out of band
    expect(ctx.store.fetchSigned(avatar.url)).toMatchObject({ status: 404, reason: 'missing' });
    expect((await ctx.as(id).get(PATH)).status).toBe(200);
    expect((await ctx.as(id).delete(PATH)).status).toBe(200);
    await settled();
    expect(ctx.store.keys).toEqual([]);
  });
});

describe('when private storage is not configured', () => {
  it('shows no picture, refuses uploads with 503, and still lets a member remove one', async () => {
    const off = await createPrivateMediaTestContext({ privateMedia: 'off' });
    try {
      const { id } = await off.seedUser();
      const get = await off.as(id).get(PATH);
      expect(get.status).toBe(200);
      expect(get.body.data.avatar).toBeNull();

      const put = await off
        .as(id)
        .put(PATH)
        .set('Content-Type', 'image/png')
        .send(await realPng());
      expect(put.status).toBe(503);
      expect(put.body.error.code).toBe('PRIVATE_STORAGE_NOT_CONFIGURED');

      expect((await off.as(id).delete(PATH)).status).toBe(200);
    } finally {
      await off.close();
    }
  }, 120_000);
});
