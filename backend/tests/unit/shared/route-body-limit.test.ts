import type { RequestHandler } from 'express';
import request from 'supertest';
import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/app.js';
import { loadConfig } from '../../../src/config/env.js';
import type { Container } from '../../../src/container.js';
import { AppError } from '../../../src/shared/errors/app-error.js';
import {
  defineRoute,
  largeBodyRouteKeys,
  requestRouteKey,
  type RouteGroup,
} from '../../../src/shared/http/route.js';
import { currentCorrelationId } from '../../../src/shared/logging/request-correlation.js';
import { createCapturingLogger } from '../../helpers/capture-logger.js';

/**
 * A route that carries a photo or an audio clip as base64 inside JSON declares its own bigger `bodyLimit`. These tests
 * drive the REAL createApp middleware stack and pin the rules that make that safe: the bigger body is read only after
 * authentication, only on the routes that declare it, and every other route keeps the small application-wide limit.
 */

const MB = 1024 * 1024;
const config = loadConfig({
  DATABASE_URL: 'postgres://app:pw@localhost:5432/app_dev',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  HMAC_SECRET: 'b'.repeat(40),
  JWT_ISSUER: 'issuer',
  JWT_AUDIENCE: 'audience',
  LOG_LEVEL: 'silent',
});
const passThrough: RequestHandler = (_req, _res, next) => next();
/** Accepts "Authorization: Bearer ok" and refuses everything else, like the real authenticate does. */
const authenticate: RequestHandler = (req, _res, next) => {
  if (req.headers.authorization === 'Bearer ok') return next();
  next(new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication is required.'));
};

const okSchema = z.object({ received: z.number(), correlationId: z.string().nullable() });
const handled = vi.fn();

const route = (path: string, extra: { bodyLimit?: string; method?: 'post' | 'put' } = {}) =>
  defineRoute({
    method: extra.method ?? 'post',
    path,
    summary: 'test',
    tags: ['test'],
    access: { kind: 'authenticated' },
    ...(extra.bodyLimit ? { bodyLimit: extra.bodyLimit } : {}),
    response: { status: 200, description: 'ok', message: 'ok', schema: okSchema },
    handler: async (req) => {
      handled(req.originalUrl);
      const body = req.body as { data?: string } | undefined;
      return { data: { received: body?.data?.length ?? 0, correlationId: currentCorrelationId() ?? null } };
    },
  });

const groups: RouteGroup[] = [
  {
    basePath: '/api/v1/test',
    routes: [
      route('/plain'),
      route('/big', { bodyLimit: '3mb' }),
      route('/big-put', { bodyLimit: '3mb', method: 'put' }),
    ],
  },
];

const buildApp = () => {
  const capture = createCapturingLogger();
  const container = {
    routeGroups: groups,
    authenticate,
    rateLimiters: { global: passThrough },
  } as unknown as Container;
  return createApp({ config, logger: capture.logger, container });
};

const payload = (bytes: number) => ({ data: 'x'.repeat(bytes) });
const authed = (req: request.Test) => req.set('Authorization', 'Bearer ok');

describe('requestRouteKey', () => {
  it('ignores the case and trailing slashes that Express ignores when it matches routes', () => {
    const key = 'POST /api/v1/nutrition/meal-photo/analyze';
    expect(requestRouteKey('post', '/api/v1/nutrition/meal-photo/analyze')).toBe(key);
    expect(requestRouteKey('POST', '/API/V1/Nutrition/Meal-Photo/Analyze/')).toBe(key);
    expect(requestRouteKey('POST', '/api/v1/nutrition/meal-photo/analyze///')).toBe(key);
  });

  it('keeps the method part of the identity', () => {
    expect(requestRouteKey('GET', '/a')).not.toBe(requestRouteKey('POST', '/a'));
  });
});

describe('largeBodyRouteKeys', () => {
  it('lists exactly the routes that declare a bodyLimit, from the same specs the router is built from', () => {
    expect([...largeBodyRouteKeys(groups)].sort()).toEqual([
      'POST /api/v1/test/big',
      'PUT /api/v1/test/big-put',
    ]);
  });

  it('is empty when no route declares one', () => {
    expect(largeBodyRouteKeys([{ basePath: '/api/v1/x', routes: [route('/a')] }]).size).toBe(0);
  });

  it('handles a route at the root of its group', () => {
    const keys = largeBodyRouteKeys([{ basePath: '/api/v1/x', routes: [route('/', { bodyLimit: '2mb' })] }]);
    expect([...keys]).toEqual(['POST /api/v1/x']);
  });

  it('refuses a route with a path parameter, which a path lookup could not match safely', () => {
    expect(() =>
      largeBodyRouteKeys([{ basePath: '/api/v1/x', routes: [route('/:id', { bodyLimit: '2mb' })] }]),
    ).toThrow(/without parameters/);
  });
});

describe('a route with its own bodyLimit, through the real application', () => {
  it('reads the big body only after authentication: nobody signed out makes the server buffer it', async () => {
    handled.mockClear();
    const response = await request(buildApp())
      .post('/api/v1/test/big')
      .send(payload(2 * MB));
    // 401, not 413: the small global parser did not touch it, and the route's parser never ran.
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
    expect(handled).not.toHaveBeenCalled();
  });

  it('accepts a body far over the global limit once signed in, and parses it', async () => {
    handled.mockClear();
    const response = await authed(request(buildApp()).post('/api/v1/test/big')).send(payload(2 * MB));
    expect(response.status).toBe(200);
    expect(response.body.data.received).toBe(2 * MB);
    expect(handled).toHaveBeenCalledTimes(1);
  });

  it('still has a limit of its own: a body over it is refused with a readable 413', async () => {
    const response = await authed(request(buildApp()).post('/api/v1/test/big')).send(payload(3 * MB + 1024));
    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('answers malformed JSON with a 400, not a crash', async () => {
    const response = await authed(request(buildApp()).post('/api/v1/test/big'))
      .set('Content-Type', 'application/json')
      .send('{"data": "unterminated');
    expect(response.status).toBe(400);
  });

  it('does not depend on how the path is spelled (case, trailing slash)', async () => {
    const app = buildApp();
    const signedOut = await request(app)
      .post('/API/V1/TEST/BIG/')
      .send(payload(2 * MB));
    expect(signedOut.status).toBe(401);
    const signedIn = await authed(request(app).post('/Api/V1/Test/Big/')).send(payload(2 * MB));
    expect(signedIn.status).toBe(200);
  });

  it('keeps the correlation id the AI client forwards to Python, even though the body is parsed after it was bound', async () => {
    const response = await authed(request(buildApp()).post('/api/v1/test/big'))
      .set('X-Request-Id', 'mobile-request-1234')
      .send(payload(1 * MB));
    expect(response.status).toBe(200);
    expect(response.body.data.correlationId).toBe('mobile-request-1234');
  });

  it('only the declared method gets the bigger limit', async () => {
    // /big is POST only; a PUT to it is not the declared route, so the small global limit applies.
    const response = await authed(request(buildApp()).put('/api/v1/test/big')).send(payload(2 * MB));
    expect(response.status).toBe(413);
  });
});

describe('every other route keeps the small application-wide limit', () => {
  it('a normal route refuses a body over BODY_LIMIT (100kb by default), signed in or not', async () => {
    const app = buildApp();
    const signedIn = await authed(request(app).post('/api/v1/test/plain')).send(payload(150 * 1024));
    expect(signedIn.status).toBe(413);
    const signedOut = await request(app)
      .post('/api/v1/test/plain')
      .send(payload(150 * 1024));
    expect(signedOut.status).toBe(413);
  });

  it('a normal route still takes an ordinary body', async () => {
    const response = await authed(request(buildApp()).post('/api/v1/test/plain')).send(payload(10 * 1024));
    expect(response.status).toBe(200);
    expect(response.body.data.received).toBe(10 * 1024);
  });

  it('the bigger limit does not leak to a sibling route in the same group', async () => {
    const response = await authed(request(buildApp()).post('/api/v1/test/plain')).send(payload(2 * MB));
    expect(response.status).toBe(413);
  });
});
