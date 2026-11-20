import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { realJpeg, realPng, padPng } from '../../helpers/images.js';
import { FakePrivateObjectStore, keyOfFakeUrl } from '../../helpers/fake-private-store.js';
import {
  createTestContext,
  login,
  seedUser,
  type LoggedIn,
  type TestContext,
} from '../../helpers/test-app.js';

/**
 * Member photos through the REAL composition root (`createContainer` + `createApp`): real configuration parsing,
 * real authentication and rate limiters, real route mounting and body handling, a real migrated PostgreSQL, and the
 * in-memory fake in place of the private bucket. The feature tests (member-avatar, progress-photos) use a smaller
 * app on purpose; this file is what proves the container actually hands those features their storage, limiter and
 * deletion worker.
 */
// Obviously fake credentials: the config is valid, but the store is replaced by the fake, so nothing can reach R2.
const PRIVATE_ENV = {
  R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
  R2_PRIVATE_BUCKET: 'fitonus-private-test',
  R2_PRIVATE_ACCESS_KEY_ID: 'TESTPRIVATEKEYID000000',
  R2_PRIVATE_SECRET_ACCESS_KEY: 'TEST-PRIVATE-SECRET-THAT-MUST-NEVER-LEAK',
};
const AVATAR = '/api/v1/profile/avatar';
const PHOTOS = '/api/v1/progress/photos';

describe('member photos through the container (private storage configured)', () => {
  let ctx: TestContext;
  let store: FakePrivateObjectStore;
  let alice: LoggedIn;
  let bob: LoggedIn;
  const api = () => request(ctx.app);

  const settle = async (): Promise<void> => {
    await ctx.container.privateMedia!.purger.drain();
    await vi.waitFor(async () =>
      expect(await ctx.container.privateMedia!.deletionQueue.pendingCount()).toBe(0),
    );
  };

  beforeAll(async () => {
    store = new FakePrivateObjectStore();
    ctx = await createTestContext(PRIVATE_ENV, { privateStore: store });
    alice = await login(ctx.app, await seedUser(ctx.db.pool));
    bob = await login(ctx.app, await seedUser(ctx.db.pool));
  }, 180_000);
  afterAll(async () => {
    await ctx?.container.privateMedia?.purger.stop();
    await ctx?.close();
  });
  beforeEach(async () => {
    await settle();
    store.objects.clear();
    store.clearFailures();
  });

  it('builds private media from the configuration, and a test store replaces the real one', () => {
    expect(ctx.config.media.privateMedia).toMatchObject({
      bucket: 'fitonus-private-test',
      purgeEnabled: true,
    });
    expect(ctx.container.privateMedia).not.toBeNull();
    expect(ctx.container.privateMedia?.store).toBe(store);
    expect(ctx.container.privateMedia?.purgeEnabled).toBe(true);
  });

  it('keeps the avatar: upload with the raw image, read back with working signed URLs, replace, remove', async () => {
    const put = await api()
      .put(AVATAR)
      .set(alice.auth)
      .set('Content-Type', 'image/jpeg')
      .send(await realJpeg({ width: 800, height: 600 }));
    expect(put.status).toBe(200);
    const first = put.body.data.avatar as { url: string; thumbnailUrl: string; version: string };
    expect(store.fetchSigned(first.url).status).toBe(200);
    expect(store.fetchSigned(first.thumbnailUrl).status).toBe(200);
    expect(put.headers['cache-control']).toContain('no-store');

    const get = await api().get(AVATAR).set(alice.auth);
    expect(get.status).toBe(200);
    expect(get.body.data.avatar.version).toBe(first.version);

    const replaced = await api()
      .put(AVATAR)
      .set(alice.auth)
      .set('Content-Type', 'image/png')
      .send(await realPng({ width: 300, height: 300 }));
    expect(replaced.status).toBe(200);
    expect(replaced.body.data.avatar.version).not.toBe(first.version);
    await settle();
    expect(store.keys).toHaveLength(2); // the new picture and thumbnail only; the old pair was purged

    expect((await api().delete(AVATAR).set(alice.auth)).status).toBe(200);
    await settle();
    expect(store.keys).toHaveLength(0);
    expect((await api().get(AVATAR).set(alice.auth)).body.data.avatar).toBeNull();
  });

  it('needs a signed-in member on every route, and reads nothing before authentication', async () => {
    expect((await api().get(AVATAR)).status).toBe(401);
    expect(
      (
        await api()
          .put(AVATAR)
          .set('Content-Type', 'image/png')
          .send(await realPng())
      ).status,
    ).toBe(401);
    expect((await api().delete(AVATAR)).status).toBe(401);
    expect((await api().get(PHOTOS)).status).toBe(401);
    expect(
      (
        await api()
          .post(PHOTOS)
          .set('Content-Type', 'image/png')
          .send(await realPng())
      ).status,
    ).toBe(401);
    expect((await api().get(`${PHOTOS}/00000000-0000-4000-8000-000000000000`)).status).toBe(401);
    expect((await api().delete(`${PHOTOS}/00000000-0000-4000-8000-000000000000`)).status).toBe(401);
    expect(store.objects.size).toBe(0);
  });

  it('accepts a picture larger than the small JSON body limit (the route carries its own, larger limit)', async () => {
    const big = padPng(await realPng({ width: 200, height: 200 }), 600_000);
    expect(big.length).toBeGreaterThan(100 * 1024);
    const res = await api().post(PHOTOS).set(alice.auth).set('Content-Type', 'image/png').send(big);
    expect(res.status).toBe(201);
  });

  it('runs the full progress-photo lifecycle, and another member can neither see nor delete it', async () => {
    const created = await api()
      .post(`${PHOTOS}?takenOn=2026-11-19&tag=front`)
      .set(alice.auth)
      .set('Content-Type', 'image/jpeg')
      .send(await realJpeg({ width: 900, height: 1200 }));
    expect(created.status).toBe(201);
    const id = created.body.data.photo.id as string;

    const list = await api().get(PHOTOS).set(alice.auth);
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).toContain(id);
    const one = await api().get(`${PHOTOS}/${id}`).set(alice.auth);
    expect(one.status).toBe(200);
    expect(store.fetchSigned(one.body.data.url as string).status).toBe(200);

    // Bob sees nothing of Alice's, and cannot delete it: the answer is the same as for an id that never existed.
    expect(JSON.stringify((await api().get(PHOTOS).set(bob.auth)).body)).not.toContain(id);
    expect((await api().get(`${PHOTOS}/${id}`).set(bob.auth)).status).toBe(404);
    expect((await api().delete(`${PHOTOS}/${id}`).set(bob.auth)).status).toBe(404);
    expect(store.keys).toHaveLength(2);

    expect((await api().delete(`${PHOTOS}/${id}`).set(alice.auth)).status).toBe(200);
    await settle();
    expect(store.keys).toHaveLength(0);
    expect((await api().get(`${PHOTOS}/${id}`).set(alice.auth)).status).toBe(404);
  });

  it('queues and removes every object of a member whose account is deleted', async () => {
    const carol = await seedUser(ctx.db.pool);
    const carolAuth = await login(ctx.app, carol);
    await api()
      .put(AVATAR)
      .set(carolAuth.auth)
      .set('Content-Type', 'image/png')
      .send(await realPng({ width: 300, height: 300 }));
    await api()
      .post(PHOTOS)
      .set(carolAuth.auth)
      .set('Content-Type', 'image/png')
      .send(await realPng({ width: 400, height: 500 }));
    expect(store.keys).toHaveLength(4);

    await ctx.db.pool.query('DELETE FROM users WHERE id = $1', [carol.id]);
    await settle();
    expect(store.keys).toHaveLength(0);
  });

  it('gives uploads their own per-member budget of 30 requests, checked before anything is read', async () => {
    const dave = await login(ctx.app, await seedUser(ctx.db.pool));
    const refused = (): Promise<number> =>
      api()
        .put(AVATAR)
        .set(dave.auth)
        .set('Content-Type', 'text/plain')
        .send('not a picture')
        .then((res) => res.status);
    for (let i = 0; i < 30; i += 1) expect(await refused()).toBe(415);
    expect(await refused()).toBe(429);
    // Another member is unaffected, and reading is not limited by the upload budget.
    expect((await api().get(AVATAR).set(bob.auth)).status).toBe(200);
    expect((await api().get(AVATAR).set(dave.auth)).status).toBe(200);
  }, 60_000);

  it('never reveals a key, a signed URL host secret or a credential in an error', async () => {
    store.failNext('put', 2);
    const res = await api()
      .put(AVATAR)
      .set(bob.auth)
      .set('Content-Type', 'image/png')
      .send(await realPng({ width: 200, height: 200 }));
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('PRIVATE_STORAGE_UNAVAILABLE');
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('members/');
    expect(text).not.toContain(PRIVATE_ENV.R2_PRIVATE_SECRET_ACCESS_KEY);
    expect(text).not.toContain(PRIVATE_ENV.R2_PRIVATE_ACCESS_KEY_ID);
  });

  it('signed URLs point at the member who asked, never at a different owner', async () => {
    const res = await api()
      .put(AVATAR)
      .set(bob.auth)
      .set('Content-Type', 'image/png')
      .send(await realPng({ width: 200, height: 200 }));
    expect(res.status).toBe(200);
    const key = keyOfFakeUrl(res.body.data.avatar.url as string);
    const { rows } = await ctx.db.pool.query<{ user_id: string }>(
      'SELECT user_id FROM member_avatars WHERE object_key = $1',
      [key],
    );
    expect(rows).toHaveLength(1);
    expect(key).toContain(`members/${rows[0]!.user_id}/avatar/`);
  });
});

describe('member photos through the container (private storage NOT configured)', () => {
  let ctx: TestContext;
  let member: LoggedIn;
  const api = () => request(ctx.app);

  beforeAll(async () => {
    ctx = await createTestContext();
    member = await login(ctx.app, await seedUser(ctx.db.pool));
  }, 180_000);
  afterAll(async () => {
    await ctx?.close();
  });

  it('is off: no storage, no deletion worker', () => {
    expect(ctx.config.media.privateMedia).toBeNull();
    expect(ctx.container.privateMedia ?? null).toBeNull();
  });

  it('shows "no picture", refuses uploads with 503, and affects nothing else', async () => {
    expect((await api().get(AVATAR).set(member.auth)).body.data.avatar).toBeNull();
    const put = await api()
      .put(AVATAR)
      .set(member.auth)
      .set('Content-Type', 'image/png')
      .send(await realPng());
    expect(put.status).toBe(503);
    expect(put.body.error.code).toBe('PRIVATE_STORAGE_NOT_CONFIGURED');
    expect((await api().get(PHOTOS).set(member.auth)).status).toBe(503);
    expect((await api().get('/api/v1/progress/weight').set(member.auth)).status).not.toBe(503);
  });
});

describe('PRIVATE_MEDIA_PURGE_ENABLED=false', () => {
  let ctx: TestContext;
  let member: LoggedIn;
  const store = new FakePrivateObjectStore();

  beforeAll(async () => {
    ctx = await createTestContext(
      { ...PRIVATE_ENV, PRIVATE_MEDIA_PURGE_ENABLED: 'false' },
      { privateStore: store },
    );
    member = await login(ctx.app, await seedUser(ctx.db.pool));
  }, 180_000);
  afterAll(async () => {
    await ctx?.close();
  });

  it('keeps this process from deleting on its own (a request does not kick the worker, the loop never starts)', async () => {
    const media = ctx.container.privateMedia!;
    expect(media.purgeEnabled).toBe(false);
    const put = await request(ctx.app)
      .put(AVATAR)
      .set(member.auth)
      .set('Content-Type', 'image/png')
      .send(await realPng({ width: 200, height: 200 }));
    expect(put.status).toBe(200);
    expect((await request(ctx.app).delete(AVATAR).set(member.auth)).status).toBe(200);

    media.purger.start();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(await media.deletionQueue.pendingCount()).toBe(2);
    expect(store.keys).toHaveLength(2);

    // An explicit drain (an operator, or another instance's loop) still works, and still empties the queue.
    await media.purger.drain();
    expect(await media.deletionQueue.pendingCount()).toBe(0);
    expect(store.keys).toHaveLength(0);
  });
});
