import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Database, PgUnitOfWork } from '../../../src/database/transaction.js';
import {
  DEFAULT_DISPATCHER_OPTIONS,
  NotificationDispatcher,
} from '../../../src/modules/notifications/application/services/notification-dispatcher.js';
import type {
  PushMessage,
  PushSender,
  PushSendResult,
} from '../../../src/modules/notifications/application/ports.js';
import { DEFAULT_RETRY_POLICY } from '../../../src/modules/notifications/domain/notification-policy.js';
import { PgDispatchRepository } from '../../../src/modules/notifications/infrastructure/pg-campaign-repository.js';
import {
  createTestContext,
  login,
  seedUser,
  type LoggedIn,
  type SeededUser,
  type TestContext,
} from '../../helpers/test-app.js';

/** Provider fake: records every message and answers from a per-token script (default: accepted). */
class FakeSender implements PushSender {
  dryRun = false;
  sent: PushMessage[] = [];
  results = new Map<string, PushSendResult[]>();

  async send(message: PushMessage): Promise<PushSendResult> {
    this.sent.push(message);
    const queue = this.results.get(message.token);
    return queue?.shift() ?? { kind: 'accepted', messageId: `msg-${this.sent.length}` };
  }

  script(token: string, ...results: PushSendResult[]): void {
    this.results.set(token, results);
  }
}

const DISPATCH_SECRET = 'd'.repeat(40);
const tokenFor = (label: string) => `fcm_${label}_`.padEnd(40, 'x');

describe('notifications over HTTP (real container + PostgreSQL)', () => {
  let ctx: TestContext;
  let sender: FakeSender;
  let admin: LoggedIn;
  const users: { user: SeededUser; auth: LoggedIn }[] = [];

  const api = () => request(ctx.app);
  const pool = () => ctx.db.pool;
  const dispatcher = () => ctx.container.notifications!.dispatcher!;

  const registerDevice = (who: LoggedIn, installationId: string, token: string) =>
    api().put(`/api/v1/notifications/devices/${installationId}`).set(who.auth).send({
      installationId,
      pushToken: token,
      platform: 'android',
      appVersion: '1.0.0',
      timeZone: 'Asia/Kolkata',
    });

  const audience = (...ids: string[]) => ({ type: 'users', userIds: ids });
  const content = (overrides: Record<string, unknown> = {}) => ({
    title: 'New challenge',
    body: 'A fresh challenge is live.',
    category: 'announcements',
    destination: 'challenges',
    ...overrides,
  });

  /** Creates a campaign scheduled in the future (so the in-process "kick" cannot race the test). */
  const schedule = async (body: Record<string, unknown>, key?: string) => {
    const req = api()
      .post('/api/v1/admin/notifications')
      .set(admin.auth)
      .send({
        mode: 'schedule',
        scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
        ...body,
      });
    return key ? req.set('Idempotency-Key', key) : req;
  };

  /** Makes a scheduled campaign due and runs the dispatcher until nothing is left to do. */
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
    return (
      await pool().query<{ status: string }>('SELECT status FROM notification_campaigns WHERE id = $1', [id])
    ).rows[0]!.status;
  };

  const sendNow = async (body: Record<string, unknown>) => {
    const res = await schedule(body);
    expect(res.status).toBe(201);
    return { id: res.body.data.id as string, status: await runCampaign(res.body.data.id as string) };
  };

  beforeAll(async () => {
    sender = new FakeSender();
    ctx = await createTestContext({ NOTIFICATIONS_DISPATCH_SECRET: DISPATCH_SECRET }, { pushSender: sender });
    admin = await login(ctx.app, await seedUser(ctx.db.pool, { role: 'admin' }));
    for (let i = 0; i < 3; i += 1) {
      const user = await seedUser(ctx.db.pool);
      users.push({ user, auth: await login(ctx.app, user) });
    }
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    sender.sent = [];
    sender.results.clear();
    await pool().query('DELETE FROM notifications');
    await pool().query('DELETE FROM notification_campaigns');
    await pool().query('DELETE FROM user_push_devices');
    await pool().query('DELETE FROM notification_preferences');
    await pool().query('DELETE FROM user_settings');
    await pool().query('DELETE FROM idempotency_keys');
  });

  // ---------------------------------------------------------------------------------------------
  describe('authentication and authorization', () => {
    const memberRoutes: [string, string][] = [
      ['get', '/api/v1/notifications'],
      ['get', '/api/v1/notifications/unread-count'],
      ['post', '/api/v1/notifications/read-all'],
      ['get', '/api/v1/notifications/preferences'],
      ['get', '/api/v1/notifications/devices'],
    ];
    const missing = '8f4b3a64-1d1c-4c3e-8e69-5d3d2f9c7a01';
    const adminRoutes: [string, string][] = [
      ['get', '/api/v1/admin/notifications'],
      ['post', '/api/v1/admin/notifications'],
      ['post', '/api/v1/admin/notifications/preview'],
      ['get', `/api/v1/admin/notifications/${missing}`],
      ['patch', `/api/v1/admin/notifications/${missing}`],
      ['post', `/api/v1/admin/notifications/${missing}/send`],
      ['post', `/api/v1/admin/notifications/${missing}/cancel`],
      ['get', `/api/v1/admin/notifications/${missing}/deliveries`],
    ];

    it.each([...memberRoutes, ...adminRoutes])('%s %s requires authentication', async (method, path) => {
      const res = await (api() as unknown as Record<string, (p: string) => request.Test>)[method]!(path);
      expect(res.status).toBe(401);
    });

    it.each(adminRoutes)('%s %s is forbidden to a member, even with a valid body', async (method, path) => {
      const res = await (api() as unknown as Record<string, (p: string) => request.Test>)[method]!(path)
        .set(users[0]!.auth.auth)
        .send({ ...content(), audience: { type: 'all' }, mode: 'send_now', confirmBulk: true, version: 1 });
      expect(res.status).toBe(403);
    });

    it('a member cannot send a bulk notification, and nothing is stored', async () => {
      const res = await api()
        .post('/api/v1/admin/notifications')
        .set(users[0]!.auth.auth)
        .send({ ...content(), audience: { type: 'all' }, mode: 'send_now', confirmBulk: true });
      expect(res.status).toBe(403);
      const { rows } = await pool().query('SELECT 1 FROM notification_campaigns');
      expect(rows).toHaveLength(0);
    });

    it('the dispatch trigger answers 404 unless the shared secret matches', async () => {
      expect((await api().post('/api/v1/internal/notifications/dispatch')).status).toBe(404);
      expect(
        (await api().post('/api/v1/internal/notifications/dispatch').set('X-Dispatch-Secret', 'nope')).status,
      ).toBe(404);
      const ok = await api()
        .post('/api/v1/internal/notifications/dispatch')
        .set('X-Dispatch-Secret', DISPATCH_SECRET);
      expect(ok.status).toBe(200);
      expect(ok.body.data).toMatchObject({ campaigns: expect.any(Number), attempted: expect.any(Number) });
    });

    it('the dispatch trigger does not exist when no secret is configured', async () => {
      const bare = await createTestContext({}, { pushSender: new FakeSender() });
      try {
        const res = await request(bare.app)
          .post('/api/v1/internal/notifications/dispatch')
          .set('X-Dispatch-Secret', DISPATCH_SECRET);
        expect(res.status).toBe(404);
      } finally {
        await bare.close();
      }
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('device registration', () => {
    it('registers, lists without ever returning the token, and refreshes in place', async () => {
      const [{ auth }] = users as [(typeof users)[number]];
      const first = await registerDevice(auth, 'install-0001', tokenFor('first'));
      expect(first.status).toBe(200);
      expect(JSON.stringify(first.body)).not.toContain(tokenFor('first'));

      const rotated = await registerDevice(auth, 'install-0001', tokenFor('rotated'));
      expect(rotated.body.data.id).toBe(first.body.data.id);

      const list = await api().get('/api/v1/notifications/devices').set(auth.auth);
      expect(list.body.data).toHaveLength(1);
      expect(JSON.stringify(list.body)).not.toContain('rotated');
      const { rows } = await pool().query<{ push_token: string }>('SELECT push_token FROM user_push_devices');
      expect(rows.map((r) => r.push_token)).toEqual([tokenFor('rotated')]);
    });

    it('supports several devices per user', async () => {
      const { auth } = users[0]!;
      await registerDevice(auth, 'install-phone', tokenFor('phone'));
      await registerDevice(auth, 'install-tablet', tokenFor('tablet'));
      const list = await api().get('/api/v1/notifications/devices').set(auth.auth);
      expect(list.body.data.map((d: { installationId: string }) => d.installationId).sort()).toEqual([
        'install-phone',
        'install-tablet',
      ]);
    });

    it('moves a token to the account that signs in on the same phone (single owner)', async () => {
      await registerDevice(users[0]!.auth, 'install-shared', tokenFor('shared'));
      const second = await registerDevice(users[1]!.auth, 'install-shared-b', tokenFor('shared'));
      expect(second.status).toBe(200);
      const first = await api().get('/api/v1/notifications/devices').set(users[0]!.auth.auth);
      expect(first.body.data).toEqual([]);
      const { rows } = await pool().query('SELECT user_id FROM user_push_devices');
      expect(rows).toEqual([{ user_id: users[1]!.user.id }]);
    });

    it("a user cannot remove (or even detect) another user's device", async () => {
      await registerDevice(users[0]!.auth, 'install-owned', tokenFor('owned'));
      const attempt = await api()
        .delete('/api/v1/notifications/devices/install-owned')
        .set(users[1]!.auth.auth);
      expect(attempt.status).toBe(200);
      expect(attempt.body.data).toEqual({ removed: false });
      expect((await pool().query('SELECT 1 FROM user_push_devices')).rows).toHaveLength(1);
    });

    it('removes your own device, and removing it again still succeeds', async () => {
      const { auth } = users[0]!;
      await registerDevice(auth, 'install-bye', tokenFor('bye'));
      expect(
        (await api().delete('/api/v1/notifications/devices/install-bye').set(auth.auth)).body.data,
      ).toEqual({ removed: true });
      expect(
        (await api().delete('/api/v1/notifications/devices/install-bye').set(auth.auth)).body.data,
      ).toEqual({ removed: false });
    });

    it('rejects malformed input', async () => {
      const { auth } = users[0]!;
      const mismatch = await api()
        .put('/api/v1/notifications/devices/install-aaaa')
        .set(auth.auth)
        .send({ installationId: 'install-bbbb', pushToken: tokenFor('x') });
      expect(mismatch.status).toBe(400);
      const badToken = await api()
        .put('/api/v1/notifications/devices/install-aaaa')
        .set(auth.auth)
        .send({ installationId: 'install-aaaa', pushToken: 'has spaces and <script>' });
      expect(badToken.status).toBe(400);
      const extra = await api()
        .put('/api/v1/notifications/devices/install-aaaa')
        .set(auth.auth)
        .send({ installationId: 'install-aaaa', pushToken: tokenFor('x'), userId: users[1]!.user.id });
      expect(extra.status).toBe(400);
    });

    it('a body cannot name another user: the device always belongs to the caller', async () => {
      await registerDevice(users[0]!.auth, 'install-mine', tokenFor('mine'));
      const { rows } = await pool().query('SELECT user_id FROM user_push_devices');
      expect(rows[0]!.user_id).toBe(users[0]!.user.id);
    });
  });

  describe('rate limiting', () => {
    it('caps device registration per user, and does not throttle other users for it', async () => {
      const noisyUser = await seedUser(pool());
      const noisy = await login(ctx.app, noisyUser);
      let lastStatus = 200;
      for (let i = 0; i < 41; i += 1)
        lastStatus = (await registerDevice(noisy, 'install-noisy', tokenFor(`n${i}`))).status;
      expect(lastStatus).toBe(429);
      // A different signed-in user is unaffected.
      expect((await registerDevice(users[2]!.auth, 'install-calm', tokenFor('calm'))).status).toBe(200);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('preferences', () => {
    it('defaults everything to on, then applies partial updates', async () => {
      const { auth } = users[0]!;
      const initial = await api().get('/api/v1/notifications/preferences').set(auth.auth);
      expect(initial.body.data.pushEnabled).toBe(true);
      expect(Object.values(initial.body.data.categories).every(Boolean)).toBe(true);

      const updated = await api()
        .put('/api/v1/notifications/preferences')
        .set(auth.auth)
        .send({ categories: { announcements: false } });
      expect(updated.body.data.categories.announcements).toBe(false);
      expect(updated.body.data.categories.challenges).toBe(true);

      await api()
        .put('/api/v1/notifications/preferences')
        .set(auth.auth)
        .send({ categories: { workout_reminders: false } });
      const after = await api().get('/api/v1/notifications/preferences').set(auth.auth);
      expect(after.body.data.categories).toMatchObject({
        announcements: false,
        workout_reminders: false,
        challenges: true,
      });
    });

    it('stores the master switch in the existing user_settings column', async () => {
      const { auth, user } = users[0]!;
      await api().put('/api/v1/notifications/preferences').set(auth.auth).send({ pushEnabled: false });
      const { rows } = await pool().query<{ notifications_enabled: boolean }>(
        'SELECT notifications_enabled FROM user_settings WHERE user_id = $1',
        [user.id],
      );
      expect(rows[0]!.notifications_enabled).toBe(false);
      expect(
        (await api().get('/api/v1/notifications/preferences').set(auth.auth)).body.data.pushEnabled,
      ).toBe(false);
    });

    it('rejects unknown categories and empty updates', async () => {
      const { auth } = users[0]!;
      expect(
        (
          await api()
            .put('/api/v1/notifications/preferences')
            .set(auth.auth)
            .send({ categories: { spam: true } })
        ).status,
      ).toBe(400);
      expect((await api().put('/api/v1/notifications/preferences').set(auth.auth).send({})).status).toBe(400);
    });

    it("keeps each user's preferences separate", async () => {
      await api()
        .put('/api/v1/notifications/preferences')
        .set(users[0]!.auth.auth)
        .send({ categories: { challenges: false } });
      const other = await api().get('/api/v1/notifications/preferences').set(users[1]!.auth.auth);
      expect(other.body.data.categories.challenges).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('campaign lifecycle', () => {
    it('drafts, previews, edits with optimistic locking, then sends', async () => {
      const [a] = users as [(typeof users)[number]];
      await registerDevice(a.auth, 'install-a', tokenFor('a'));
      const draft = await api()
        .post('/api/v1/admin/notifications')
        .set(admin.auth)
        .send({ ...content(), audience: audience(a.user.id), mode: 'draft' });
      expect(draft.status).toBe(201);
      expect(draft.body.data.status).toBe('draft');
      const id = draft.body.data.id as string;

      const preview = await api()
        .post('/api/v1/admin/notifications/preview')
        .set(admin.auth)
        .send({ ...content(), audience: audience(a.user.id) });
      expect(preview.body.data.audience).toEqual({
        matchedUsers: 1,
        eligibleUsers: 1,
        pushableUsers: 1,
        pushableDevices: 1,
      });
      expect(preview.body.data.pushAvailable).toBe(true);
      expect(sender.sent).toHaveLength(0); // previewing never sends

      const edited = await api()
        .patch(`/api/v1/admin/notifications/${id}`)
        .set(admin.auth)
        .send({ ...content({ title: 'Edited' }), audience: audience(a.user.id), version: 1 });
      expect(edited.body.data).toMatchObject({ title: 'Edited', version: 2 });
      const stale = await api()
        .patch(`/api/v1/admin/notifications/${id}`)
        .set(admin.auth)
        .send({ ...content(), audience: audience(a.user.id), version: 1 });
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe('VERSION_CONFLICT');

      const send = await api()
        .post(`/api/v1/admin/notifications/${id}/send`)
        .set(admin.auth)
        .send({ scheduledAt: new Date(Date.now() + 3_600_000).toISOString() });
      expect(send.status).toBe(200);
      expect(send.body.data.status).toBe('scheduled');
      expect(await runCampaign(id)).toBe('sent');
      expect(sender.sent).toHaveLength(1);
    });

    it('requires explicit confirmation for bulk audiences, enforced by the backend', async () => {
      const unconfirmed = await schedule({ ...content(), audience: { type: 'all' } });
      expect(unconfirmed.status).toBe(422);
      expect(unconfirmed.body.error.code).toBe('BULK_CONFIRMATION_REQUIRED');
      expect((await pool().query('SELECT 1 FROM notification_campaigns')).rows).toHaveLength(0);

      const confirmed = await schedule({ ...content(), audience: { type: 'all' }, confirmBulk: true });
      expect(confirmed.status).toBe(201);
    });

    it('does not execute a schedule before it is due', async () => {
      const { user, auth } = users[0]!;
      await registerDevice(auth, 'install-a', tokenFor('a'));
      const res = await schedule({ ...content(), audience: audience(user.id) });
      expect(res.body.data.status).toBe('scheduled');
      await dispatcher().runOnce();
      expect(sender.sent).toHaveLength(0);
      expect(await runCampaign(res.body.data.id)).toBe('sent');
      expect(sender.sent).toHaveLength(1);
    });

    it('cancels a scheduled notification so it is never sent', async () => {
      const { user, auth } = users[0]!;
      await registerDevice(auth, 'install-a', tokenFor('a'));
      const res = await schedule({ ...content(), audience: audience(user.id) });
      const id = res.body.data.id as string;
      const cancelled = await api().post(`/api/v1/admin/notifications/${id}/cancel`).set(admin.auth);
      expect(cancelled.body.data.status).toBe('cancelled');

      await pool().query(
        "UPDATE notification_campaigns SET scheduled_at = now() - interval '1 minute' WHERE id = $1",
        [id],
      );
      await dispatcher().runOnce();
      expect(sender.sent).toHaveLength(0);
      expect((await pool().query('SELECT 1 FROM notifications')).rows).toHaveLength(0);
    });

    it('cannot cancel or edit once sent, and cannot send twice', async () => {
      const { user, auth } = users[0]!;
      await registerDevice(auth, 'install-a', tokenFor('a'));
      const { id } = await sendNow({ ...content(), audience: audience(user.id) });
      const cancel = await api().post(`/api/v1/admin/notifications/${id}/cancel`).set(admin.auth);
      expect(cancel.status).toBe(409);
      expect(cancel.body.error.code).toBe('INVALID_STATE_TRANSITION');
      const resend = await api()
        .post(`/api/v1/admin/notifications/${id}/send`)
        .set(admin.auth)
        .send({ confirmBulk: true });
      expect(resend.status).toBe(409);
      const edit = await api()
        .patch(`/api/v1/admin/notifications/${id}`)
        .set(admin.auth)
        .send({ ...content(), audience: audience(user.id), version: 1 });
      expect(edit.status).toBe(409);
      expect(sender.sent).toHaveLength(1);
    });

    it('replays an idempotent create instead of queueing a second campaign', async () => {
      const { user } = users[0]!;
      const body = {
        ...content(),
        audience: audience(user.id),
        mode: 'schedule',
        scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
      };
      const first = await api()
        .post('/api/v1/admin/notifications')
        .set(admin.auth)
        .set('Idempotency-Key', 'campaign-key-0001')
        .send(body);
      const second = await api()
        .post('/api/v1/admin/notifications')
        .set(admin.auth)
        .set('Idempotency-Key', 'campaign-key-0001')
        .send(body);
      expect(second.headers['idempotent-replayed']).toBe('true');
      expect(second.body.data.id).toBe(first.body.data.id);
      expect((await pool().query('SELECT 1 FROM notification_campaigns')).rows).toHaveLength(1);

      const reused = await api()
        .post('/api/v1/admin/notifications')
        .set(admin.auth)
        .set('Idempotency-Key', 'campaign-key-0001')
        .send({ ...body, title: 'Different' });
      expect(reused.status).toBe(422);
    });

    it('rejects bad content and out-of-allowlist destinations', async () => {
      const base = { audience: audience(users[0]!.user.id), mode: 'draft' };
      const post = (extra: Record<string, unknown>) =>
        api()
          .post('/api/v1/admin/notifications')
          .set(admin.auth)
          .send({ ...content(), ...base, ...extra });
      expect((await post({ destination: 'https://evil.example' })).status).toBe(400);
      expect((await post({ destination: '/admin/secret' })).status).toBe(400);
      expect((await post({ title: '   ' })).status).toBe(400);
      expect((await post({ title: 'x'.repeat(101) })).status).toBe(400);
      expect((await post({ body: 'y'.repeat(501) })).status).toBe(400);
      expect((await post({ title: 'bell\u0007' })).status).toBe(400);
      expect((await post({ category: 'workout_reminders' })).status).toBe(400); // reminders are local-only
      // An empty segment must not silently mean "everyone".
      const emptySegment = await post({ audience: { type: 'segment', filter: {} } });
      expect(emptySegment.status).toBe(400);
      expect(emptySegment.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('records audit entries for create and cancel', async () => {
      const { user } = users[0]!;
      await pool().query("DELETE FROM admin_audit_logs WHERE action LIKE 'notification.%'");
      const res = await schedule({ ...content(), audience: audience(user.id) });
      await api().post(`/api/v1/admin/notifications/${res.body.data.id}/cancel`).set(admin.auth);
      const { rows } = await pool().query<{ action: string }>(
        "SELECT action FROM admin_audit_logs WHERE action LIKE 'notification.%' ORDER BY created_at",
      );
      expect(rows.map((r) => r.action)).toEqual(['notification.schedule', 'notification.cancel']);
    });

    it('lists campaigns with pagination and a status filter', async () => {
      const { user } = users[0]!;
      for (let i = 0; i < 3; i += 1)
        await schedule({ ...content({ title: `T${i}` }), audience: audience(user.id) });
      await api()
        .post('/api/v1/admin/notifications')
        .set(admin.auth)
        .send({ ...content(), audience: audience(user.id), mode: 'draft' });
      const page = await api().get('/api/v1/admin/notifications?limit=2&page=1').set(admin.auth);
      expect(page.body.data).toHaveLength(2);
      expect(page.body.meta).toMatchObject({ total: 4, totalPages: 2 });
      const drafts = await api().get('/api/v1/admin/notifications?status=draft').set(admin.auth);
      expect(drafts.body.meta.total).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('fan-out rules and user preferences', () => {
    it('skips users who switched the category off: no inbox item, no push', async () => {
      const [a, b] = users as [(typeof users)[number], (typeof users)[number]];
      await registerDevice(a.auth, 'install-a', tokenFor('a'));
      await registerDevice(b.auth, 'install-b', tokenFor('b'));
      await api()
        .put('/api/v1/notifications/preferences')
        .set(b.auth.auth)
        .send({ categories: { announcements: false } });

      const { id, status } = await sendNow({ ...content(), audience: audience(a.user.id, b.user.id) });
      expect(status).toBe('sent');
      expect(sender.sent.map((m) => m.token)).toEqual([tokenFor('a')]);
      expect((await api().get('/api/v1/notifications').set(b.auth.auth)).body.data.items).toHaveLength(0);
      const detail = await api().get(`/api/v1/admin/notifications/${id}`).set(admin.auth);
      expect(detail.body.data).toMatchObject({ targetCount: 2, skippedCount: 1 });
    });

    it('still honours other categories for a user who opted out of one', async () => {
      const [a] = users as [(typeof users)[number]];
      await registerDevice(a.auth, 'install-a', tokenFor('a'));
      await api()
        .put('/api/v1/notifications/preferences')
        .set(a.auth.auth)
        .send({ categories: { announcements: false } });
      await sendNow({ ...content({ category: 'challenges' }), audience: audience(a.user.id) });
      expect(sender.sent).toHaveLength(1);
    });

    it('with the master switch off the user still gets the inbox item but no push', async () => {
      const [a] = users as [(typeof users)[number]];
      await registerDevice(a.auth, 'install-a', tokenFor('a'));
      await api().put('/api/v1/notifications/preferences').set(a.auth.auth).send({ pushEnabled: false });
      await sendNow({ ...content(), audience: audience(a.user.id) });
      expect(sender.sent).toHaveLength(0);
      expect((await api().get('/api/v1/notifications').set(a.auth.auth)).body.data.items).toHaveLength(1);
    });

    it('never targets disabled accounts', async () => {
      const disabled = await seedUser(pool(), { status: 'disabled' });
      await pool().query(
        "INSERT INTO user_push_devices (user_id, installation_id, push_token) VALUES ($1, 'install-disabled', $2)",
        [disabled.id, tokenFor('disabled')],
      );
      const res = await schedule({ ...content(), audience: audience(disabled.id) });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('NO_ELIGIBLE_RECIPIENTS');
    });

    it('delivers an inbox item even when the user has no device', async () => {
      const [a] = users as [(typeof users)[number]];
      const { status } = await sendNow({ ...content(), audience: audience(a.user.id) });
      expect(status).toBe('sent');
      expect(sender.sent).toHaveLength(0);
      expect((await api().get('/api/v1/notifications').set(a.auth.auth)).body.data.items).toHaveLength(1);
    });

    it('targets a segment using profile data', async () => {
      const [a, b] = users as [(typeof users)[number], (typeof users)[number]];
      await pool().query(
        "INSERT INTO user_profiles (user_id, primary_goal, onboarding_completed) VALUES ($1, 'lose', true), ($2, 'gain', true)",
        [a.user.id, b.user.id],
      );
      await registerDevice(a.auth, 'install-a', tokenFor('a'));
      await registerDevice(b.auth, 'install-b', tokenFor('b'));
      const preview = await api()
        .post('/api/v1/admin/notifications/preview')
        .set(admin.auth)
        .send({ ...content(), audience: { type: 'segment', filter: { primaryGoal: ['lose'] } } });
      expect(preview.body.data.audience.eligibleUsers).toBe(1);
      expect(preview.body.data.requiresConfirmation).toBe(true);

      await sendNow({
        ...content(),
        audience: { type: 'segment', filter: { primaryGoal: ['lose'] } },
        confirmBulk: true,
      });
      expect(sender.sent.map((m) => m.token)).toEqual([tokenFor('a')]);
    });

    it('fans out to every active device of a user, but not to invalid ones', async () => {
      const [a] = users as [(typeof users)[number]];
      await registerDevice(a.auth, 'install-phone', tokenFor('phone'));
      await registerDevice(a.auth, 'install-tablet', tokenFor('tablet'));
      await pool().query(
        "UPDATE user_push_devices SET status = 'invalid' WHERE installation_id = 'install-tablet'",
      );
      await sendNow({ ...content(), audience: audience(a.user.id) });
      expect(sender.sent.map((m) => m.token)).toEqual([tokenFor('phone')]);
    });

    it('is idempotent: fanning out the same campaign twice creates no duplicates', async () => {
      const [a] = users as [(typeof users)[number]];
      await registerDevice(a.auth, 'install-a', tokenFor('a'));
      const res = await schedule({ ...content(), audience: audience(a.user.id) });
      const id = res.body.data.id as string;
      const repo = new PgDispatchRepository(new Database(pool()), new PgUnitOfWork(new Database(pool())));
      // Run the real fan-out twice against the same claimed (unfanned) campaign, as a crash-and-retry would.
      await pool().query(
        "UPDATE notification_campaigns SET scheduled_at = now() - interval '1 second' WHERE id = $1",
        [id],
      );
      await repo.claimDueCampaigns(1, 60_000).then(async ([claimed]) => {
        await repo.fanOut(claimed!);
        await repo.fanOut(claimed!);
      });
      expect((await pool().query('SELECT 1 FROM notifications')).rows).toHaveLength(1);
      expect((await pool().query('SELECT 1 FROM notification_deliveries')).rows).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('delivery tracking, failures and retries', () => {
    it('stores "accepted" and only becomes "received" when the app confirms', async () => {
      const [a] = users as [(typeof users)[number]];
      await registerDevice(a.auth, 'install-a', tokenFor('a'));
      const { id } = await sendNow({ ...content(), audience: audience(a.user.id) });

      let detail = await api().get(`/api/v1/admin/notifications/${id}`).set(admin.auth);
      expect(detail.body.data.status).toBe('sent');
      expect(detail.body.data.deliveries).toMatchObject({ total: 1, accepted: 1, received: 0 });

      const inbox = await api().get('/api/v1/notifications').set(a.auth.auth);
      const notificationId = inbox.body.data.items[0].id as string;
      expect(sender.sent[0]!.data.notificationId).toBe(notificationId);
      await api().post(`/api/v1/notifications/${notificationId}/received`).set(a.auth.auth).expect(200);

      detail = await api().get(`/api/v1/admin/notifications/${id}`).set(admin.auth);
      expect(detail.body.data.deliveries).toMatchObject({ accepted: 0, received: 1 });
    });

    it('deactivates a device whose token FCM rejects, and reports the failure to the admin', async () => {
      const [a, b] = users as [(typeof users)[number], (typeof users)[number]];
      await registerDevice(a.auth, 'install-a', tokenFor('a'));
      await registerDevice(b.auth, 'install-b', tokenFor('b'));
      sender.script(tokenFor('b'), { kind: 'invalid_token', code: 'UNREGISTERED' });

      const { id, status } = await sendNow({ ...content(), audience: audience(a.user.id, b.user.id) });
      expect(status).toBe('partially_failed');
      const { rows } = await pool().query<{ status: string; invalidated_reason: string }>(
        "SELECT status, invalidated_reason FROM user_push_devices WHERE installation_id = 'install-b'",
      );
      expect(rows[0]).toEqual({ status: 'invalid', invalidated_reason: 'UNREGISTERED' });

      const failed = await api()
        .get(`/api/v1/admin/notifications/${id}/deliveries?status=invalid_token`)
        .set(admin.auth);
      expect(failed.body.data).toHaveLength(1);
      expect(failed.body.data[0]).toMatchObject({
        errorCode: 'UNREGISTERED',
        status: 'invalid_token',
        userEmail: b.user.email,
      });
      expect(JSON.stringify(failed.body)).not.toContain(tokenFor('b'));

      // The next campaign no longer attempts the dead token.
      sender.sent = [];
      await sendNow({ ...content({ title: 'Again' }), audience: audience(a.user.id, b.user.id) });
      expect(sender.sent.map((m) => m.token)).toEqual([tokenFor('a')]);
    });

    it('retries a transient failure and records the extra attempt', async () => {
      const [a] = users as [(typeof users)[number]];
      await registerDevice(a.auth, 'install-a', tokenFor('a'));
      sender.script(tokenFor('a'), { kind: 'retryable', code: 'UNAVAILABLE' });
      const res = await schedule({ ...content(), audience: audience(a.user.id) });
      const id = res.body.data.id as string;

      expect(await runCampaign(id)).toBe('sending'); // waiting out the back-off
      expect(sender.sent).toHaveLength(1);
      const waiting = await pool().query<{ status: string; attempts: number; error_code: string }>(
        'SELECT status, attempts, error_code FROM notification_deliveries',
      );
      expect(waiting.rows[0]).toEqual({ status: 'pending', attempts: 1, error_code: 'UNAVAILABLE' });

      await dispatcher().runOnce();
      expect(sender.sent).toHaveLength(1); // still backing off: no immediate resend

      await pool().query('UPDATE notification_deliveries SET next_attempt_at = now()');
      expect(await runCampaign(id)).toBe('sent');
      expect(sender.sent).toHaveLength(2);
      const done = await pool().query<{ status: string; attempts: number }>(
        'SELECT status, attempts FROM notification_deliveries',
      );
      expect(done.rows[0]).toEqual({ status: 'accepted', attempts: 2 });
    });

    it('stops retrying after the attempt budget and marks the campaign failed', async () => {
      const [a] = users as [(typeof users)[number]];
      await registerDevice(a.auth, 'install-a', tokenFor('a'));
      sender.script(
        tokenFor('a'),
        ...Array.from({ length: 10 }, () => ({ kind: 'retryable', code: 'QUOTA_EXCEEDED' }) as const),
      );
      const res = await schedule({ ...content(), audience: audience(a.user.id) });
      const id = res.body.data.id as string;

      let status = await runCampaign(id);
      for (let i = 0; i < 8 && status === 'sending'; i += 1) {
        await pool().query('UPDATE notification_deliveries SET next_attempt_at = now()');
        status = await runCampaign(id);
      }
      expect(status).toBe('failed');
      expect(sender.sent).toHaveLength(DEFAULT_RETRY_POLICY.maxAttempts);
      const row = await pool().query<{ status: string; attempts: number; error_code: string }>(
        'SELECT status, attempts, error_code FROM notification_deliveries',
      );
      expect(row.rows[0]).toEqual({
        status: 'failed',
        attempts: DEFAULT_RETRY_POLICY.maxAttempts,
        error_code: 'QUOTA_EXCEEDED',
      });
    });

    it('a worker that died mid-send does not cause a re-send past the attempt budget', async () => {
      const [a] = users as [(typeof users)[number]];
      await registerDevice(a.auth, 'install-a', tokenFor('a'));
      const res = await schedule({ ...content(), audience: audience(a.user.id) });
      const id = res.body.data.id as string;
      await pool().query(
        "UPDATE notification_campaigns SET scheduled_at = now() - interval '1 second' WHERE id = $1",
        [id],
      );
      const repo = new PgDispatchRepository(new Database(pool()), new PgUnitOfWork(new Database(pool())));
      const [claimed] = await repo.claimDueCampaigns(1, 60_000);
      await repo.fanOut(claimed!);
      // Simulate a crash: delivery left 'processing' with an expired lease and the budget already spent.
      await pool().query(
        `UPDATE notification_deliveries SET status = 'processing', attempts = ${DEFAULT_RETRY_POLICY.maxAttempts}, locked_until = now() - interval '1 minute'`,
      );
      await pool().query(
        "UPDATE notification_campaigns SET locked_until = now() - interval '1 minute' WHERE id = $1",
        [id],
      );
      expect(await runCampaign(id)).toBe('failed');
      expect(sender.sent).toHaveLength(0);
    });

    it('two dispatchers running at once send each delivery exactly once', async () => {
      const recipients: { user: SeededUser; auth: LoggedIn }[] = [];
      for (let i = 0; i < 6; i += 1) {
        const user = await seedUser(pool());
        recipients.push({ user, auth: await login(ctx.app, user) });
      }
      for (const [i, r] of recipients.entries())
        await registerDevice(r.auth, `install-${i}-bulk`, tokenFor(`bulk${i}`));

      const res = await schedule({
        ...content(),
        audience: audience(...recipients.map((r) => r.user.id)),
        confirmBulk: true,
      });
      const id = res.body.data.id as string;
      await pool().query(
        "UPDATE notification_campaigns SET scheduled_at = now() - interval '1 second' WHERE id = $1",
        [id],
      );

      const database = new Database(pool());
      const make = () =>
        new NotificationDispatcher(
          { repo: new PgDispatchRepository(database, new PgUnitOfWork(database)), sender },
          { ...DEFAULT_DISPATCHER_OPTIONS, retry: DEFAULT_RETRY_POLICY, batchSize: 2, concurrency: 2 },
        );
      await Promise.all([make().runOnce(), make().runOnce(), make().runOnce()]);
      for (let i = 0; i < 4; i += 1) await make().runOnce();

      const tokens = sender.sent.map((m) => m.token);
      expect(tokens).toHaveLength(6);
      expect(new Set(tokens).size).toBe(6);
      const { rows } = await pool().query<{ status: string }>(
        'SELECT status FROM notification_campaigns WHERE id = $1',
        [id],
      );
      expect(rows[0]!.status).toBe('sent');
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('inbox', () => {
    it('lists newest first with pagination, unread tracking and read-all', async () => {
      const [a] = users as [(typeof users)[number]];
      for (let i = 0; i < 3; i += 1)
        await sendNow({ ...content({ title: `N${i}` }), audience: audience(a.user.id) });

      const page1 = await api().get('/api/v1/notifications?limit=2&page=1').set(a.auth.auth);
      expect(page1.body.data.items.map((n: { title: string }) => n.title)).toEqual(['N2', 'N1']);
      expect(page1.body.data.unreadCount).toBe(3);
      expect(page1.body.meta).toMatchObject({ total: 3, totalPages: 2, page: 1, limit: 2 });
      const page2 = await api().get('/api/v1/notifications?limit=2&page=2').set(a.auth.auth);
      expect(page2.body.data.items.map((n: { title: string }) => n.title)).toEqual(['N0']);

      const first = page1.body.data.items[0] as { id: string };
      await api().post(`/api/v1/notifications/${first.id}/read`).set(a.auth.auth).expect(200);
      expect(
        (await api().get('/api/v1/notifications/unread-count').set(a.auth.auth)).body.data.unreadCount,
      ).toBe(2);
      expect(
        (await api().get('/api/v1/notifications?unreadOnly=true').set(a.auth.auth)).body.data.items,
      ).toHaveLength(2);

      const all = await api().post('/api/v1/notifications/read-all').set(a.auth.auth);
      expect(all.body.data.updated).toBe(2);
      expect(
        (await api().get('/api/v1/notifications/unread-count').set(a.auth.auth)).body.data.unreadCount,
      ).toBe(0);
    });

    it("never exposes, reads, confirms or deletes another user's notification", async () => {
      const [a, b] = users as [(typeof users)[number], (typeof users)[number]];
      await sendNow({ ...content(), audience: audience(a.user.id) });
      const mine = (await api().get('/api/v1/notifications').set(a.auth.auth)).body.data.items[0] as {
        id: string;
      };

      expect((await api().get('/api/v1/notifications').set(b.auth.auth)).body.data.items).toEqual([]);
      for (const attempt of [
        api().post(`/api/v1/notifications/${mine.id}/read`),
        api().post(`/api/v1/notifications/${mine.id}/received`),
        api().delete(`/api/v1/notifications/${mine.id}`),
      ]) {
        const res = await attempt.set(b.auth.auth);
        expect(res.status).toBe(404);
      }
      // ...and A's notification is untouched.
      const after = (await api().get('/api/v1/notifications').set(a.auth.auth)).body.data.items[0] as {
        read: boolean;
      };
      expect(after.read).toBe(false);
      expect((await api().post('/api/v1/notifications/read-all').set(b.auth.auth)).body.data.updated).toBe(0);
    });

    it('deleting hides an item from the inbox and the unread count', async () => {
      const [a] = users as [(typeof users)[number]];
      await sendNow({ ...content(), audience: audience(a.user.id) });
      const item = (await api().get('/api/v1/notifications').set(a.auth.auth)).body.data.items[0] as {
        id: string;
      };
      await api().delete(`/api/v1/notifications/${item.id}`).set(a.auth.auth).expect(200);
      const list = await api().get('/api/v1/notifications').set(a.auth.auth);
      expect(list.body.data).toEqual({ items: [], unreadCount: 0 });
      expect((await api().post(`/api/v1/notifications/${item.id}/read`).set(a.auth.auth)).status).toBe(404);
    });

    it('rejects a non-UUID id', async () => {
      expect(
        (await api().post('/api/v1/notifications/not-a-uuid/read').set(users[0]!.auth.auth)).status,
      ).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('when push delivery is not configured', () => {
    it('still serves the inbox but refuses to queue a send; drafts are fine', async () => {
      const noPush = await createTestContext({}, { pushSender: null });
      try {
        const adminUser = await seedUser(noPush.db.pool, { role: 'admin' });
        const adminAuth = await login(noPush.app, adminUser);
        const target = await seedUser(noPush.db.pool);
        const send = await request(noPush.app)
          .post('/api/v1/admin/notifications')
          .set(adminAuth.auth)
          .send({ ...content(), audience: audience(target.id), mode: 'send_now' });
        expect(send.status).toBe(503);
        expect(send.body.error.code).toBe('PUSH_NOT_CONFIGURED');
        const draft = await request(noPush.app)
          .post('/api/v1/admin/notifications')
          .set(adminAuth.auth)
          .send({ ...content(), audience: audience(target.id), mode: 'draft' });
        expect(draft.status).toBe(201);
        expect(noPush.container.notifications?.dispatcher).toBeNull();
      } finally {
        await noPush.close();
      }
    });
  });
});
