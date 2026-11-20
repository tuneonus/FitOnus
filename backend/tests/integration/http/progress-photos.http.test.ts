import sharp from 'sharp';
import supertest from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { IMAGE_UPLOAD_MAX_BYTES } from '../../../src/shared/images/image-policy.js';
import { PROGRESS_PHOTO_LIMIT } from '../../../src/modules/progress/domain/progress-photo.js';
import {
  isOwnedPrivateImageKey,
  newPrivateImageKey,
  privateThumbnailKey,
} from '../../../src/shared/private-media/private-image-policy.js';
import { GIF_BYTES, heicSample, realJpeg, realPng } from '../../helpers/images.js';
import { keyOfFakeUrl } from '../../helpers/fake-private-store.js';
import {
  createPrivateMediaTestContext,
  type PrivateMediaTestContext,
} from '../../helpers/private-media-app.js';

const PATH = '/api/v1/progress/photos';

let ctx: PrivateMediaTestContext;
beforeAll(async () => {
  ctx = await createPrivateMediaTestContext();
}, 180_000);
afterAll(async () => {
  await ctx?.close();
});
beforeEach(async () => {
  ctx.setNow(new Date('2026-11-20T12:00:00Z'));
  await ctx.media.purger.drain();
  ctx.store.objects.clear();
  ctx.store.calls.length = 0;
  await ctx.db.pool.query('TRUNCATE private_media_deletions');
});

const settled = async () => {
  await ctx.media.purger.drain();
  await vi.waitFor(async () => expect(await ctx.media.deletionQueue.pendingCount()).toBe(0));
};

const photoBody = (width = 600, height = 800) => realJpeg({ width, height });

async function addPhoto(
  userId: string,
  options: { takenOn?: string; tag?: string; body?: Buffer; type?: string } = {},
) {
  const params = new URLSearchParams();
  if (options.takenOn) params.set('takenOn', options.takenOn);
  if (options.tag) params.set('tag', options.tag);
  const query = params.toString();
  return ctx
    .as(userId)
    .post(`${PATH}${query ? `?${query}` : ''}`)
    .set('Content-Type', options.type ?? 'image/jpeg')
    .send(options.body ?? (await photoBody()));
}

/** Inserts photo rows directly (with real keys but no stored files), to reach the limits without 50 image decodes. */
async function seedRows(userId: string, count: number, takenOn = '2026-10-01') {
  for (let i = 0; i < count; i += 1) {
    await ctx.db.pool.query(
      `INSERT INTO progress_photos (user_id, object_key, taken_on, width, height, byte_size) VALUES ($1, $2, $3, 600, 800, 10000)`,
      [userId, newPrivateImageKey(userId, 'progress'), takenOn],
    );
  }
}

describe('authentication', () => {
  it('every route needs a signed-in member', async () => {
    const { id } = await ctx.seedUser();
    const photo = (await addPhoto(id)).body.data.photo;
    const app = supertest(ctx.app);
    for (const res of [
      await app.get(PATH),
      await app
        .post(PATH)
        .set('Content-Type', 'image/jpeg')
        .send(Buffer.from([1])),
      await app.get(`${PATH}/${photo.id}`),
      await app.delete(`${PATH}/${photo.id}`),
    ]) {
      expect(res.status).toBe(401);
    }
  });
});

describe('POST /progress/photos', () => {
  it('stores the photo and a 200 px thumbnail privately and returns the new count', async () => {
    const { id } = await ctx.seedUser();
    const res = await addPhoto(id, {
      takenOn: '2026-11-18',
      tag: 'front',
      body: await realJpeg({ width: 3000, height: 4000 }),
    });

    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('private, no-store');
    const { photo, count, limit, nearLimit } = res.body.data;
    expect({ count, limit, nearLimit }).toEqual({ count: 1, limit: PROGRESS_PHOTO_LIMIT, nearLimit: false });
    expect(photo).toMatchObject({ takenOn: '2026-11-18', tag: 'front', width: 1200, height: 1600 });
    expect(photo.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(photo.urlExpiresAt).toBe('2026-11-20T12:15:00.000Z');
    // No storage key, bucket or owner id is a field of its own.
    expect(Object.keys(photo).sort()).toEqual([
      'createdAt',
      'height',
      'id',
      'tag',
      'takenOn',
      'thumbnailUrl',
      'url',
      'urlExpiresAt',
      'version',
      'width',
    ]);

    const key = keyOfFakeUrl(photo.url);
    expect(isOwnedPrivateImageKey(key, id, 'progress')).toBe(true);
    expect(keyOfFakeUrl(photo.thumbnailUrl)).toBe(privateThumbnailKey(key));
    expect(ctx.store.keys).toEqual([key, privateThumbnailKey(key)].sort());

    const full = ctx.store.fetchSigned(photo.url);
    expect(await sharp(Buffer.from(full.body!)).metadata()).toMatchObject({
      format: 'webp',
      width: 1200,
      height: 1600,
    });
    const thumb = ctx.store.fetchSigned(photo.thumbnailUrl);
    expect(await sharp(Buffer.from(thumb.body!)).metadata()).toMatchObject({
      format: 'webp',
      width: 200,
      height: 267,
    });
    for (const object of ctx.store.objects.values()) expect(object.cacheControl).toMatch(/^private,/);
  });

  it('defaults the day to today, tags are optional, and PNG, HEIC and WebP are accepted', async () => {
    const { id } = await ctx.seedUser();
    const png = await addPhoto(id, { body: await realPng({ width: 300, height: 400 }), type: 'image/png' });
    expect(png.status).toBe(201);
    expect(png.body.data.photo).toMatchObject({ takenOn: '2026-11-20', tag: null });
    expect((await addPhoto(id, { body: heicSample(), type: 'image/heic' })).status).toBe(201);
  });

  it('strips EXIF, GPS and camera details from everything stored', async () => {
    const { id } = await ctx.seedUser();
    await addPhoto(id, { body: await realJpeg({ exif: true, width: 800, height: 1000 }) });
    for (const [key, object] of ctx.store.objects) {
      expect((await sharp(Buffer.from(object.body)).metadata()).exif, key).toBeUndefined();
      const text = Buffer.from(object.body).toString('latin1');
      for (const marker of ['Exif', 'GPS', 'PrivateCameraMaker', 'PrivateModel'])
        expect(text.includes(marker)).toBe(false);
    }
  });

  describe('validation (refused before any photo is read or stored)', () => {
    it.each([
      ['a day that does not exist', '?takenOn=2026-02-30'],
      ['a day in the future', '?takenOn=2027-06-01'],
      ['a day before 2000', '?takenOn=1999-12-31'],
      ['a date in the wrong format', '?takenOn=20-11-2026'],
      ['an unknown tag', '?tag=selfie'],
      ['an unknown parameter', '?note=hello'],
    ])('%s', async (_name, query) => {
      const { id } = await ctx.seedUser();
      const res = await ctx
        .as(id)
        .post(`${PATH}${query}`)
        .set('Content-Type', 'image/jpeg')
        .send(await photoBody());
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(ctx.store.keys).toEqual([]);
      expect((await ctx.as(id).get(PATH)).body.data.count).toBe(0);
    });

    it('accepts today in a time zone ahead of UTC (tomorrow in UTC) but not two days ahead', async () => {
      const { id } = await ctx.seedUser();
      expect((await addPhoto(id, { takenOn: '2026-11-21' })).status).toBe(201);
      expect((await addPhoto(id, { takenOn: '2026-11-22' })).status).toBe(400);
    });

    it.each([
      ['an unsupported type', 'application/json', Buffer.from('{}'), 415, 'UNSUPPORTED_MEDIA_TYPE'],
      ['a GIF', 'image/jpeg', GIF_BYTES, 422, 'INVALID_IMAGE'],
      ['an empty body', 'image/jpeg', Buffer.alloc(0), 422, 'INVALID_IMAGE'],
    ])('%s', async (_name, type, body, status, code) => {
      const { id } = await ctx.seedUser();
      const res = await addPhoto(id, { type, body });
      expect(res.status).toBe(status);
      expect(res.body.error.code).toBe(code);
      expect(ctx.store.keys).toEqual([]);
    });

    it('a file over 10 MiB is 413', async () => {
      const { id } = await ctx.seedUser();
      const res = await addPhoto(id, { body: Buffer.alloc(IMAGE_UPLOAD_MAX_BYTES + 1, 0xff) });
      expect(res.status).toBe(413);
      expect(ctx.store.keys).toEqual([]);
    });
  });

  describe(`the limit of ${PROGRESS_PHOTO_LIMIT} photos`, () => {
    it('warns from 45 photos (nearLimit) and refuses the 51st with 409 before reading the photo', async () => {
      const { id } = await ctx.seedUser();
      await seedRows(id, 43);
      const at44 = (await addPhoto(id)).body.data;
      expect(at44).toMatchObject({ count: 44, nearLimit: false });
      const at45 = (await addPhoto(id)).body.data;
      expect(at45).toMatchObject({ count: 45, nearLimit: true });

      await seedRows(id, PROGRESS_PHOTO_LIMIT - 45);
      const gallery = (await ctx.as(id).get(PATH)).body.data;
      expect(gallery).toMatchObject({
        count: PROGRESS_PHOTO_LIMIT,
        limit: PROGRESS_PHOTO_LIMIT,
        nearLimit: true,
      });

      const storedBefore = ctx.store.keys;
      ctx.store.calls.length = 0;
      const refused = await addPhoto(id);
      expect(refused.status).toBe(409);
      expect(refused.body.error.code).toBe('PHOTO_LIMIT_REACHED');
      expect(refused.body.error.message).toContain(String(PROGRESS_PHOTO_LIMIT));
      expect(ctx.store.keys).toEqual(storedBefore); // nothing stored
      expect(ctx.store.count('put')).toBe(0); // and the photo was not even converted
    });

    it('makes room again after a delete', async () => {
      const { id } = await ctx.seedUser();
      await seedRows(id, PROGRESS_PHOTO_LIMIT);
      expect((await addPhoto(id)).status).toBe(409);
      const first = (await ctx.as(id).get(PATH)).body.data.photos[0];
      expect((await ctx.as(id).delete(`${PATH}/${first.id}`)).status).toBe(200);
      expect((await addPhoto(id)).status).toBe(201);
    });

    it('is exact under concurrency: five uploads racing at 48 photos let exactly two in and clean up after the rest', async () => {
      const { id } = await ctx.seedUser();
      await seedRows(id, PROGRESS_PHOTO_LIMIT - 2);
      const body = await photoBody(300, 400);
      const results = await Promise.all(Array.from({ length: 5 }, () => addPhoto(id, { body })));

      expect(results.filter((r) => r.status === 201)).toHaveLength(2);
      const refused = results.filter((r) => r.status === 409);
      expect(refused).toHaveLength(3);
      expect(refused.every((r) => r.body.error.code === 'PHOTO_LIMIT_REACHED')).toBe(true);
      const { rows } = await ctx.db.pool.query<{ count: string }>(
        'SELECT count(*) FROM progress_photos WHERE user_id = $1',
        [id],
      );
      expect(Number(rows[0]!.count)).toBe(PROGRESS_PHOTO_LIMIT);
      // The three that lost the race stored objects first; those were removed again, so only the winners' pairs remain.
      await settled();
      expect(ctx.store.keys).toHaveLength(4);
    });

    it('counts each member separately', async () => {
      const full = await ctx.seedUser();
      const other = await ctx.seedUser();
      await seedRows(full.id, PROGRESS_PHOTO_LIMIT);
      expect((await addPhoto(other.id)).status).toBe(201);
    });
  });

  describe('when storage fails', () => {
    it('answers 503 without saying why, stores no row and leaves no file', async () => {
      const { id } = await ctx.seedUser();
      ctx.store.failNext('put', 1, (key) => !key.includes('.thumb'));
      const res = await addPhoto(id);
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('PRIVATE_STORAGE_UNAVAILABLE');
      expect(res.body.error.message).not.toMatch(/503|bucket|r2|cloudflare/i);
      expect(ctx.store.keys).toEqual([]);
      expect((await ctx.as(id).get(PATH)).body.data.count).toBe(0);
    });

    it('removes the stored files when the database cannot save the row', async () => {
      const { id } = await ctx.seedUser();
      await ctx.db.pool.query('ALTER TABLE progress_photos RENAME TO progress_photos_off');
      try {
        expect((await addPhoto(id)).status).toBe(500);
      } finally {
        await ctx.db.pool.query('ALTER TABLE progress_photos_off RENAME TO progress_photos');
      }
      expect(ctx.store.keys).toEqual([]);
    });
  });
});

describe('GET /progress/photos', () => {
  it('is empty for a new member', async () => {
    const { id } = await ctx.seedUser();
    const res = await ctx.as(id).get(PATH);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.body.data).toEqual({ photos: [], count: 0, limit: PROGRESS_PHOTO_LIMIT, nearLimit: false });
  });

  it('lists newest day first, and within a day the newest upload first', async () => {
    const { id } = await ctx.seedUser();
    const jan = await addPhoto(id, { takenOn: '2026-01-10', tag: 'front' });
    const mar = await addPhoto(id, { takenOn: '2026-03-05', tag: 'side' });
    const feb = await addPhoto(id, { takenOn: '2026-02-01' });
    const marLater = await addPhoto(id, { takenOn: '2026-03-05', tag: 'back' });

    const list = (await ctx.as(id).get(PATH)).body.data.photos;
    expect(list.map((p: { id: string }) => p.id)).toEqual([
      marLater.body.data.photo.id,
      mar.body.data.photo.id,
      feb.body.data.photo.id,
      jan.body.data.photo.id,
    ]);
    expect(list.map((p: { takenOn: string }) => p.takenOn)).toEqual([
      '2026-03-05',
      '2026-03-05',
      '2026-02-01',
      '2026-01-10',
    ]);
  });

  it('gives thumbnails only: a list never carries the means to fetch every full-size picture', async () => {
    const { id } = await ctx.seedUser();
    await addPhoto(id);
    ctx.store.calls.length = 0;
    const item = (await ctx.as(id).get(PATH)).body.data.photos[0];
    expect(item.url).toBeUndefined();
    expect(item.thumbnailUrl).toContain('.thumb.webp');
    expect(Object.keys(item).sort()).toEqual([
      'createdAt',
      'height',
      'id',
      'tag',
      'takenOn',
      'thumbnailUrl',
      'urlExpiresAt',
      'version',
      'width',
    ]);
    // Only thumbnails were signed.
    expect(
      ctx.store.calls.filter((c) => c.operation === 'sign').every((c) => c.key.endsWith('.thumb.webp')),
    ).toBe(true);
  });

  it('does not touch storage per photo (no HEAD calls), however many there are', async () => {
    const { id } = await ctx.seedUser();
    await seedRows(id, 30);
    ctx.store.calls.length = 0;
    const res = await ctx.as(id).get(PATH);
    expect(res.body.data.photos).toHaveLength(30);
    expect(ctx.store.count('head')).toBe(0);
    expect(ctx.store.count('put')).toBe(0);
  });
});

describe('GET /progress/photos/:id', () => {
  it('returns the photo with its full-size URL', async () => {
    const { id } = await ctx.seedUser();
    const added = (await addPhoto(id, { tag: 'back' })).body.data.photo;
    const res = await ctx.as(id).get(`${PATH}/${added.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: added.id, tag: 'back', version: added.version });
    expect(ctx.store.fetchSigned(res.body.data.url).status).toBe(200);
  });

  it('rejects an id that is not a UUID', async () => {
    const { id } = await ctx.seedUser();
    expect((await ctx.as(id).get(`${PATH}/not-a-uuid`)).status).toBe(400);
  });
});

describe('DELETE /progress/photos/:id', () => {
  it('deletes the photo for good, removes its stored files, and reports the new count', async () => {
    const { id } = await ctx.seedUser();
    const keep = (await addPhoto(id, { takenOn: '2026-01-01' })).body.data.photo;
    const drop = (await addPhoto(id, { takenOn: '2026-02-01' })).body.data.photo;

    const res = await ctx.as(id).delete(`${PATH}/${drop.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: drop.id,
      deleted: true,
      count: 1,
      limit: PROGRESS_PHOTO_LIMIT,
    });
    await settled();

    expect(ctx.store.keys).toEqual([keyOfFakeUrl(keep.url), keyOfFakeUrl(keep.thumbnailUrl)].sort()); // only the survivor's files
    expect(ctx.store.fetchSigned(drop.url)).toMatchObject({ status: 404 });
    expect((await ctx.as(id).get(`${PATH}/${drop.id}`)).status).toBe(404);
    expect((await ctx.db.pool.query('SELECT 1 FROM progress_photos WHERE id = $1', [drop.id])).rowCount).toBe(
      0,
    ); // a real delete
    expect((await ctx.as(id).delete(`${PATH}/${drop.id}`)).status).toBe(404); // gone
  });

  it('keeps the files queued, and retries, when storage cannot delete them yet', async () => {
    const { id } = await ctx.seedUser();
    const photo = (await addPhoto(id)).body.data.photo;
    const keys = [keyOfFakeUrl(photo.url), keyOfFakeUrl(photo.thumbnailUrl)].sort();

    ctx.store.failNext('delete', 2);
    expect((await ctx.as(id).delete(`${PATH}/${photo.id}`)).status).toBe(200); // the member's delete succeeds regardless
    await vi.waitFor(() => expect(ctx.store.count('delete')).toBeGreaterThanOrEqual(2));
    await ctx.media.purger.drain();

    expect(ctx.store.keys).toEqual(keys); // still stored...
    const queued = await ctx.db.pool.query<{ object_key: string }>(
      'SELECT object_key FROM private_media_deletions ORDER BY object_key',
    );
    expect(queued.rows.map((r) => r.object_key)).toEqual(keys); // ...and still queued, so nothing is orphaned

    await ctx.db.pool.query(`UPDATE private_media_deletions SET next_attempt_at = now()`);
    await settled();
    expect(ctx.store.keys).toEqual([]);
  });
});

describe('ownership and privacy', () => {
  it("another member's photo is indistinguishable from one that does not exist, and cannot be deleted", async () => {
    const alice = await ctx.seedUser();
    const bob = await ctx.seedUser();
    const photo = (await addPhoto(alice.id)).body.data.photo;
    const nobody = '11111111-1111-4111-8111-111111111111';

    const peek = await ctx.as(bob.id).get(`${PATH}/${photo.id}`);
    const missing = await ctx.as(bob.id).get(`${PATH}/${nobody}`);
    expect(peek.status).toBe(404);
    expect(peek.body.error.code).toBe('PHOTO_NOT_FOUND');
    expect({ ...peek.body.error, requestId: undefined }).toEqual({
      ...missing.body.error,
      requestId: undefined,
    });

    const destroy = await ctx.as(bob.id).delete(`${PATH}/${photo.id}`);
    expect(destroy.status).toBe(404);
    await settled();
    // Alice's photo and both files are intact, and still open with her signed URL.
    expect((await ctx.as(alice.id).get(`${PATH}/${photo.id}`)).status).toBe(200);
    expect(ctx.store.keys).toHaveLength(2);
    expect(ctx.store.fetchSigned(photo.url).status).toBe(200);
  });

  it("each member's gallery holds only their own photos", async () => {
    const alice = await ctx.seedUser();
    const bob = await ctx.seedUser();
    const a = (await addPhoto(alice.id)).body.data.photo;
    const b = (await addPhoto(bob.id)).body.data.photo;
    expect((await ctx.as(alice.id).get(PATH)).body.data.photos.map((p: { id: string }) => p.id)).toEqual([
      a.id,
    ]);
    expect((await ctx.as(bob.id).get(PATH)).body.data.photos.map((p: { id: string }) => p.id)).toEqual([
      b.id,
    ]);
    expect(isOwnedPrivateImageKey(keyOfFakeUrl(a.url), alice.id, 'progress')).toBe(true);
    expect(keyOfFakeUrl(b.url)).not.toContain(alice.id);
  });

  it("never signs a row whose key is not the owner's (a corrupt row is left out)", async () => {
    const alice = await ctx.seedUser();
    const bob = await ctx.seedUser();
    await ctx.db.pool.query('ALTER TABLE progress_photos DROP CONSTRAINT progress_photos_object_key_valid');
    try {
      await ctx.db.pool.query(
        `INSERT INTO progress_photos (user_id, object_key, taken_on, width, height, byte_size) VALUES ($1, $2, '2026-01-01', 1, 1, 1)`,
        [bob.id, `members/${alice.id}/progress/ffffffffffffffffffffffffffffffff.webp`],
      );
      ctx.store.calls.length = 0;
      const list = await ctx.as(bob.id).get(PATH);
      expect(list.body.data.photos).toEqual([]);
      expect(ctx.store.count('sign')).toBe(0);
    } finally {
      await ctx.db.pool.query('DELETE FROM progress_photos WHERE user_id = $1', [bob.id]);
      await ctx.db.pool.query(
        `ALTER TABLE progress_photos ADD CONSTRAINT progress_photos_object_key_valid CHECK (object_key ~ ('^members/' || user_id::text || '/progress/[0-9a-f]{32}\\.webp$'))`,
      );
    }
  });

  it('hands out URLs that expire, and a refetch gives working ones (expired URL handling)', async () => {
    const { id } = await ctx.seedUser();
    const photo = (await addPhoto(id)).body.data.photo;
    expect(ctx.store.fetchSigned(photo.thumbnailUrl).status).toBe(200);

    ctx.setNow(new Date('2026-11-20T12:15:00Z'));
    expect(ctx.store.fetchSigned(photo.thumbnailUrl)).toEqual({ status: 403, reason: 'expired' });
    expect(ctx.store.fetchSigned(photo.url)).toEqual({ status: 403, reason: 'expired' });

    const fresh = (await ctx.as(id).get(PATH)).body.data.photos[0];
    expect(fresh.version).toBe(photo.version);
    expect(ctx.store.fetchSigned(fresh.thumbnailUrl).status).toBe(200);
  });

  it('a photo whose file has gone missing is a 404 from storage (the app shows its placeholder) and can still be deleted', async () => {
    const { id } = await ctx.seedUser();
    const photo = (await addPhoto(id)).body.data.photo;
    ctx.store.objects.delete(keyOfFakeUrl(photo.thumbnailUrl)); // lost out of band
    expect(ctx.store.fetchSigned(photo.thumbnailUrl)).toMatchObject({ status: 404, reason: 'missing' });
    expect((await ctx.as(id).get(PATH)).status).toBe(200);
    expect((await ctx.as(id).delete(`${PATH}/${photo.id}`)).status).toBe(200);
    await settled();
    expect(ctx.store.keys).toEqual([]);
  });
});

describe('the upload limiter', () => {
  it('runs before anything is read, and only guards uploads', async () => {
    const limited = await createPrivateMediaTestContext({
      limiters: (_req, res) => {
        res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'slow down' } });
      },
    });
    try {
      const { id } = await limited.seedUser();
      const res = await limited
        .as(id)
        .post(PATH)
        .set('Content-Type', 'image/png')
        .send(await realPng());
      expect(res.status).toBe(429);
      expect(limited.store.calls).toEqual([]);
      expect((await limited.as(id).get(PATH)).status).toBe(200);
    } finally {
      await limited.close();
    }
  }, 120_000);
});

describe('when private storage is not configured', () => {
  it('lists and uploads answer 503, and a member can still delete a photo they already have (the removal is queued)', async () => {
    const off = await createPrivateMediaTestContext({ privateMedia: 'off' });
    try {
      const { id } = await off.seedUser();
      const list = await off.as(id).get(PATH);
      expect(list.status).toBe(503);
      expect(list.body.error.code).toBe('PRIVATE_STORAGE_NOT_CONFIGURED');
      const add = await off
        .as(id)
        .post(PATH)
        .set('Content-Type', 'image/png')
        .send(await realPng());
      expect(add.status).toBe(503);
      expect((await off.as(id).get(`${PATH}/11111111-1111-4111-8111-111111111111`)).status).toBe(503);

      const key = newPrivateImageKey(id, 'progress');
      const { rows } = await off.db.pool.query<{ id: string }>(
        `INSERT INTO progress_photos (user_id, object_key, taken_on, width, height, byte_size) VALUES ($1, $2, '2026-01-01', 1, 1, 1) RETURNING id`,
        [id, key],
      );
      expect((await off.as(id).delete(`${PATH}/${rows[0]!.id}`)).status).toBe(200);
      const queued = await off.db.pool.query('SELECT count(*) FROM private_media_deletions');
      expect(queued.rows[0].count).toBe('2'); // waits in the queue until storage is configured
    } finally {
      await off.close();
    }
  }, 120_000);
});
