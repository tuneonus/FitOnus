import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestContext,
  login,
  seedUser,
  type LoggedIn,
  type TestContext,
} from '../../helpers/test-app.js';

/**
 * The mobile app's notification calls, read straight from its source, against the real application.
 *
 * A 404 from a deployed server for one of these means the deployment is older than the code (the route was
 * never registered there), not that the route is wrong: these tests prove the routes exist, with the right
 * method, behind authentication, in this version of the backend.
 */
const MOBILE_SERVICES = path.resolve(
  import.meta.dirname,
  '../../../../mobile/src/features/notifications/services',
);
const SAMPLE_UUID = '0b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const SAMPLE_INSTALLATION = 'install-contract-0001';
const API = '/api/v1';

interface MobileCall {
  method: 'get' | 'post' | 'put' | 'delete';
  path: string;
}

const concretePath = (template: string): string =>
  template
    .replace(/\$\{assertId\([^}]*\)\}/g, SAMPLE_UUID)
    .replace(/\$\{encodeURIComponent\([^}]*\)\}/g, SAMPLE_INSTALLATION)
    .replace(/\$\{[^}]*\}/g, SAMPLE_UUID);

function mobileCalls(): MobileCall[] {
  const inbox = fs.readFileSync(path.join(MOBILE_SERVICES, 'notification-inbox-api.ts'), 'utf8');
  const fromInbox = [
    ...inbox.matchAll(/http\.(get|post|put|delete)\(\s*[`'](\/notifications[^`']*)[`']/g),
  ].map((m): MobileCall => ({ method: m[1] as MobileCall['method'], path: concretePath(m[2]!) }));

  const config = fs.readFileSync(path.join(MOBILE_SERVICES, 'notification-backend-config.ts'), 'utf8');
  const upsert = /upsertDevicePath:[^`]*`([^`]+)`/.exec(config)?.[1];
  const remove = /deleteDevicePath:[^`]*`([^`]+)`/.exec(config)?.[1];
  const fromConfig: MobileCall[] = [];
  if (upsert) fromConfig.push({ method: 'put', path: concretePath(upsert) });
  if (remove) fromConfig.push({ method: 'delete', path: concretePath(remove) });

  return [...fromInbox, ...fromConfig];
}

describe('mobile notification calls match the backend routes (real container + PostgreSQL)', () => {
  let ctx: TestContext;
  let member: LoggedIn;
  let memberId: string;
  const calls = mobileCalls();

  beforeAll(async () => {
    ctx = await createTestContext();
    const user = await seedUser(ctx.db.pool);
    memberId = user.id;
    member = await login(ctx.app, user);
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it('finds every call the app makes (guards against the extraction silently matching nothing)', () => {
    const keys = calls.map((c) => `${c.method.toUpperCase()} ${c.path}`);
    expect(keys).toEqual(
      expect.arrayContaining([
        'GET /notifications',
        'GET /notifications/unread-count',
        'GET /notifications/preferences',
        'PUT /notifications/preferences',
        `POST /notifications/${SAMPLE_UUID}/read`,
        'POST /notifications/read-all',
        `POST /notifications/${SAMPLE_UUID}/received`,
        `DELETE /notifications/${SAMPLE_UUID}`,
        `PUT /notifications/devices/${SAMPLE_INSTALLATION}`,
        `DELETE /notifications/devices/${SAMPLE_INSTALLATION}`,
      ]),
    );
  });

  it('every route exists and is authenticated: 401 without a token, never ROUTE_NOT_FOUND', async () => {
    for (const call of calls) {
      const res = await request(ctx.app)[call.method](`${API}${call.path}`).send({});
      expect(res.status, `${call.method.toUpperCase()} ${call.path}`).toBe(401);
    }
  });

  it('every route is routed for a signed-in member (the use case may refuse, the router must not)', async () => {
    for (const call of calls) {
      const api = request(ctx.app);
      const res = await api[call.method](`${API}${call.path}`)
        .set(member.auth)
        .send(call.method === 'put' && call.path.includes('/devices/') ? {} : undefined);
      expect(res.body?.error?.code, `${call.method.toUpperCase()} ${call.path}`).not.toBe('ROUTE_NOT_FOUND');
      expect(res.status, `${call.method.toUpperCase()} ${call.path}`).not.toBe(405);
    }
  });

  it('answers the three calls that failed against DEV: list, preferences, and device removal', async () => {
    const list = await request(ctx.app)
      .get(`${API}/notifications`)
      .query({ page: 1, limit: 30, unreadOnly: false })
      .set(member.auth);
    expect(list.status).toBe(200);
    expect(list.body.data.items).toEqual([]);

    const prefs = await request(ctx.app).get(`${API}/notifications/preferences`).set(member.auth);
    expect(prefs.status).toBe(200);

    const removed = await request(ctx.app)
      .delete(`${API}/notifications/devices/${SAMPLE_INSTALLATION}`)
      .set(member.auth);
    expect(removed.status).toBe(200);
  });

  it('stores the device registration exactly as the app sends it, tied to the caller', async () => {
    const token = `fcm_contract_token_`.padEnd(48, 'z');
    const res = await request(ctx.app)
      .put(`${API}/notifications/devices/${SAMPLE_INSTALLATION}`)
      .set(member.auth)
      .send({
        installationId: SAMPLE_INSTALLATION,
        pushToken: token,
        platform: 'android',
        appVersion: '1.0.0',
        timeZone: 'Asia/Kolkata',
      });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(token);

    const { rows } = await ctx.db.pool.query<{
      user_id: string;
      installation_id: string;
      push_token: string;
      platform: string;
      status: string;
    }>('SELECT user_id, installation_id, push_token, platform, status FROM user_push_devices');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      installation_id: SAMPLE_INSTALLATION,
      push_token: token,
      platform: 'android',
      status: 'active',
    });
    expect(rows[0]!.user_id).toBe(memberId);
  });
});
