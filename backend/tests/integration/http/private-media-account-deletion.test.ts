import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PgUnitOfWork } from '../../../src/database/transaction.js';
import { DeleteAccountUseCase } from '../../../src/modules/users/application/use-cases/delete-account.js';
import { PgUserRepository } from '../../../src/modules/users/infrastructure/pg-user-repository.js';
import { createActor } from '../../../src/shared/auth/actor.js';
import { privateObjectKeysOf } from '../../../src/shared/private-media/private-image-policy.js';
import { keyOfFakeUrl } from '../../helpers/fake-private-store.js';
import { realJpeg, realPng } from '../../helpers/images.js';
import {
  createPrivateMediaTestContext,
  type PrivateMediaTestContext,
} from '../../helpers/private-media-app.js';

let ctx: PrivateMediaTestContext;
beforeAll(async () => {
  ctx = await createPrivateMediaTestContext();
}, 180_000);
afterAll(async () => {
  await ctx?.close();
});
beforeEach(async () => {
  await ctx.media.purger.drain();
  ctx.store.objects.clear();
  ctx.store.calls.length = 0;
  await ctx.db.pool.query('TRUNCATE private_media_deletions');
});

/** The real account-deletion use case over the real users repository (the password check is stubbed). */
const deleteAccount = (userId: string) =>
  new DeleteAccountUseCase({
    users: new PgUserRepository(ctx.database),
    passwordHasher: { hash: async () => 'x', verify: async () => true, needsRehash: () => false } as never,
    uow: new PgUnitOfWork(ctx.database),
  }).execute(createActor({ userId, sessionId: 's', role: 'member' }), { password: 'correct horse' });

async function memberWithPhotos(photos: number) {
  const user = await ctx.seedUser();
  const avatar = (
    await ctx
      .as(user.id)
      .put('/api/v1/profile/avatar')
      .set('Content-Type', 'image/png')
      .send(await realPng({ width: 400, height: 400 }))
  ).body.data.avatar;
  const keys = [...privateObjectKeysOf(keyOfFakeUrl(avatar.url))];
  for (let i = 0; i < photos; i += 1) {
    const res = await ctx
      .as(user.id)
      .post('/api/v1/progress/photos')
      .set('Content-Type', 'image/jpeg')
      .send(await realJpeg({ width: 300, height: 400 }));
    keys.push(...privateObjectKeysOf(keyOfFakeUrl(res.body.data.photo.url)));
  }
  return { user, keys: keys.sort() };
}

const pending = async (): Promise<string[]> =>
  (
    await ctx.db.pool.query<{ object_key: string }>(
      'SELECT object_key FROM private_media_deletions ORDER BY object_key',
    )
  ).rows.map((r) => r.object_key);

describe('deleting an account removes every private object of that member', () => {
  it("leaves no avatar or photo file behind, and touches nobody else's", async () => {
    const leaving = await memberWithPhotos(3);
    const staying = await memberWithPhotos(2);
    expect(leaving.keys).toHaveLength(8); // avatar + 3 photos, picture and thumbnail each
    expect(ctx.store.keys).toEqual([...leaving.keys, ...staying.keys].sort());
    // Let the avatar replacement/cleanup from setup settle so only the account deletion is measured.
    await ctx.media.purger.drain();
    await ctx.db.pool.query('TRUNCATE private_media_deletions');

    await deleteAccount(leaving.user.id);

    // The rows are gone, and the database queued exactly this member's objects in the same transaction.
    expect((await ctx.db.pool.query('SELECT 1 FROM users WHERE id = $1', [leaving.user.id])).rowCount).toBe(
      0,
    );
    expect(
      (await ctx.db.pool.query('SELECT 1 FROM progress_photos WHERE user_id = $1', [leaving.user.id]))
        .rowCount,
    ).toBe(0);
    expect(
      (await ctx.db.pool.query('SELECT 1 FROM member_avatars WHERE user_id = $1', [leaving.user.id]))
        .rowCount,
    ).toBe(0);
    expect(await pending()).toEqual(leaving.keys);

    await ctx.media.purger.drain();
    expect(ctx.store.keys).toEqual(staying.keys); // only the other member's files remain
    expect(await pending()).toEqual([]);

    // The member who stayed is untouched and still sees everything.
    const gallery = (await ctx.as(staying.user.id).get('/api/v1/progress/photos')).body.data;
    expect(gallery.count).toBe(2);
    expect(ctx.store.fetchSigned(gallery.photos[0].thumbnailUrl).status).toBe(200);
  });

  it('survives a storage outage during the cleanup: the objects stay queued and are removed once storage is back', async () => {
    const leaving = await memberWithPhotos(2);
    await ctx.media.purger.drain();
    await ctx.db.pool.query('TRUNCATE private_media_deletions');

    ctx.store.failNext('delete', 100); // storage is down
    await deleteAccount(leaving.user.id);
    await ctx.media.purger.drain();

    expect(ctx.store.keys).toEqual(leaving.keys); // nothing could be deleted yet...
    expect(await pending()).toEqual(leaving.keys); // ...and nothing was forgotten
    const attempts = await ctx.db.pool.query<{ attempts: number }>(
      'SELECT attempts FROM private_media_deletions',
    );
    expect(attempts.rows.every((r) => r.attempts >= 1)).toBe(true);

    ctx.store.clearFailures(); // storage recovers...
    await ctx.db.pool.query('UPDATE private_media_deletions SET next_attempt_at = now()'); // ...and the backoff has elapsed
    await ctx.media.purger.drain();
    await vi.waitFor(async () => expect(await pending()).toEqual([]));
    expect(ctx.store.keys).toEqual([]);
  });

  it('is atomic: when the deletion rolls back, no object is queued and nothing is lost', async () => {
    const member = await memberWithPhotos(2);
    await ctx.media.purger.drain();
    await ctx.db.pool.query('TRUNCATE private_media_deletions');

    await expect(
      new PgUnitOfWork(ctx.database).run(async () => {
        await new PgUserRepository(ctx.database).deleteById(member.user.id);
        throw new Error('something later in the same transaction failed');
      }),
    ).rejects.toThrow('later in the same transaction');

    expect(await pending()).toEqual([]); // nothing queued for a deletion that never happened
    expect(ctx.store.keys).toEqual(member.keys);
    expect((await ctx.as(member.user.id).get('/api/v1/progress/photos')).body.data.count).toBe(2);
  });

  it('never queues, and so never deletes, anything outside the private key space', async () => {
    // Everything the worker can ever be asked to remove passed the table CHECK: only `members/<id>/...` keys.
    const member = await memberWithPhotos(1);
    await deleteAccount(member.user.id);
    for (const key of await pending()) expect(key.startsWith(`members/${member.user.id}/`)).toBe(true);
  });
});
