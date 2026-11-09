import type { RequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp, DEFAULT_ALLOWED_ORIGINS } from '../../../src/app.js';
import { loadConfig } from '../../../src/config/env.js';
import type { Container } from '../../../src/container.js';
import { createActor } from '../../../src/shared/auth/actor.js';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { defineRoute, type RouteGroup } from '../../../src/shared/http/route.js';
import { createLogger } from '../../../src/shared/logging/logger.js';

describe('Vercel Admin → DEV Backend CORS & Preflight Regressions', () => {
  const VERCEL_ADMIN_ORIGIN = 'https://fit-onus.vercel.app';
  const UNAUTHORIZED_ORIGIN = 'https://unauthorized-attacker.example';
  const LOCAL_DEV_ORIGIN = 'http://localhost:5173';
  const MOBILE_DEV_ORIGIN = 'http://localhost:8081';

  // Build a test Express app using the real createApp assembly
  function createTestApp(corsOriginsConfig = `${LOCAL_DEV_ORIGIN},${MOBILE_DEV_ORIGIN}`) {
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/test_db',
      JWT_ACCESS_SECRET: 'test-secret-at-least-32-chars-long-0123456789',
      HMAC_SECRET: 'test-hmac-at-least-32-chars-long-0123456789',
      JWT_ISSUER: 'fitonus-test',
      JWT_AUDIENCE: 'fitonus-test-clients',
      CORS_ORIGINS: corsOriginsConfig,
    });

    const logger = createLogger({ level: 'silent', pretty: false });

    // Mock authenticate handler matching production behavior
    const authenticate: RequestHandler = (req, _res, next) => {
      const authHeader = req.headers['authorization'];
      const cookieHeader = req.headers['cookie'];

      let token: string | undefined;
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      } else if (cookieHeader?.includes('fitonus_admin_token=')) {
        token = cookieHeader.split('fitonus_admin_token=')[1]?.split(';')[0];
      }

      if (!token) {
        throw new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication is required.');
      }

      if (token === 'valid-admin-token') {
        req.actor = createActor({ userId: 'admin-uuid-1', sessionId: 'sess-1', role: 'admin' });
        return next();
      }

      if (token === 'regular-user-token') {
        req.actor = createActor({ userId: 'user-uuid-2', sessionId: 'sess-2', role: 'member' });
        return next();
      }

      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'Invalid authentication token.');
    };

    // Realistic admin auth routes
    const adminRoutes: RouteGroup = {
      basePath: '/api/v1/admin',
      routes: [
        defineRoute({
          method: 'get',
          path: '/auth/me',
          summary: 'Get Current Admin Profile',
          tags: ['Admin'],
          access: { kind: 'permission', permission: 'admin:access' },
          response: {
            status: 200,
            description: 'Current Admin',
            message: 'Success',
            schema: z.object({
              id: z.string(),
              email: z.string(),
              role: z.string(),
            }),
          },
          handler: (req) =>
            Promise.resolve({
              data: {
                id: req.actor!.userId,
                email: 'admin@fitonus.com',
                role: req.actor!.role,
              },
            }),
        }),
        defineRoute({
          method: 'post',
          path: '/auth/login',
          summary: 'Admin Portal Login',
          tags: ['Admin'],
          access: { kind: 'public' },
          response: {
            status: 200,
            description: 'Admin Login',
            message: 'Signed in',
            schema: z.object({ token: z.string() }),
          },
          handler: () => Promise.resolve({ data: { token: 'valid-admin-token' } }),
        }),
      ],
    };

    // Mobile / generic route to verify mobile traffic unaffected
    const mobileRoutes: RouteGroup = {
      basePath: '/api/v1/workouts',
      routes: [
        defineRoute({
          method: 'get',
          path: '/',
          summary: 'List Workouts',
          tags: ['Workouts'],
          access: { kind: 'public' },
          response: {
            status: 200,
            description: 'Workouts list',
            message: 'OK',
            schema: z.object({ items: z.array(z.string()) }),
          },
          handler: () => Promise.resolve({ data: { items: ['Chest Day', 'Leg Day'] } }),
        }),
      ],
    };

    const container: Container = {
      database: {} as any,
      routeGroups: [adminRoutes, mobileRoutes],
      authenticate,
      rateLimiters: {
        global: (_req: any, _res: any, next: any) => next(),
      } as any,
      lifecycle: {
        isShuttingDown: () => false,
        beginShutdown: () => {},
      },
    };

    return createApp({ config, logger, container });
  }

  // 1. Allowed Vercel Origin
  it('1. includes https://fit-onus.vercel.app in default allowed origins', () => {
    expect(DEFAULT_ALLOWED_ORIGINS).toContain(VERCEL_ADMIN_ORIGIN);
  });

  // 2. Successful OPTIONS preflight
  it('2. successfully responds 204 to OPTIONS preflight for /api/v1/admin/auth/me from Vercel origin', async () => {
    const app = createTestApp();
    const res = await request(app)
      .options('/api/v1/admin/auth/me')
      .set('Origin', VERCEL_ADMIN_ORIGIN)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization,content-type,x-panel-id');

    expect(res.status).toBe(204);
  });

  // 3. Correct Access-Control-Allow-Origin & Credentials
  it('3. returns correct Access-Control-Allow-Origin, Allow-Credentials, and Vary headers for Vercel origin', async () => {
    const app = createTestApp();
    const res = await request(app)
      .options('/api/v1/admin/auth/me')
      .set('Origin', VERCEL_ADMIN_ORIGIN)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization,content-type');

    expect(res.headers['access-control-allow-origin']).toBe(VERCEL_ADMIN_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['vary']).toMatch(/Origin/i);
    // Must never return wildcard with credentials
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
  });

  // 4. Correct allowed methods and headers
  it('4. returns required CORS allowed methods, allowed headers, and max-age', async () => {
    const app = createTestApp();
    const res = await request(app)
      .options('/api/v1/admin/auth/me')
      .set('Origin', VERCEL_ADMIN_ORIGIN)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization,content-type,accept,x-panel-id');

    const allowMethods = res.headers['access-control-allow-methods'];
    expect(allowMethods).toContain('GET');
    expect(allowMethods).toContain('POST');
    expect(allowMethods).toContain('OPTIONS');

    const allowHeaders = res.headers['access-control-allow-headers'];
    expect(allowHeaders).toMatch(/Authorization/i);
    expect(allowHeaders).toMatch(/Content-Type/i);
    expect(allowHeaders).toMatch(/X-Panel-Id/i);
    expect(allowHeaders).toMatch(/Accept/i);

    expect(res.headers['access-control-max-age']).toBe('600');
  });

  // 5. Unauthorized origin not granted CORS access
  it('5. does NOT grant CORS access to unauthorized origins', async () => {
    const app = createTestApp();

    // Preflight from unauthorized origin
    const preflightRes = await request(app)
      .options('/api/v1/admin/auth/me')
      .set('Origin', UNAUTHORIZED_ORIGIN)
      .set('Access-Control-Request-Method', 'GET');

    expect(preflightRes.headers['access-control-allow-origin']).toBeUndefined();

    // Actual request from unauthorized origin
    const getRes = await request(app)
      .get('/api/v1/admin/auth/me')
      .set('Origin', UNAUTHORIZED_ORIGIN);

    expect(getRes.headers['access-control-allow-origin']).toBeUndefined();
  });

  // 6. Admin authentication still protected
  it('6. protects admin endpoint: 401 when unauthenticated and 403 when lacking admin permission', async () => {
    const app = createTestApp();

    // Request with no credentials from Vercel origin returns 401 (with CORS headers so frontend receives it)
    const unauthRes = await request(app)
      .get('/api/v1/admin/auth/me')
      .set('Origin', VERCEL_ADMIN_ORIGIN);

    expect(unauthRes.status).toBe(401);
    expect(unauthRes.body.error.code).toBe('UNAUTHENTICATED');
    expect(unauthRes.headers['access-control-allow-origin']).toBe(VERCEL_ADMIN_ORIGIN);
    expect(unauthRes.headers['access-control-allow-credentials']).toBe('true');

    // Request with regular member credentials returns 403 Forbidden
    const forbiddenRes = await request(app)
      .get('/api/v1/admin/auth/me')
      .set('Origin', VERCEL_ADMIN_ORIGIN)
      .set('Authorization', 'Bearer regular-user-token');

    expect(forbiddenRes.status).toBe(403);
    expect(forbiddenRes.body.error.code).toBe('FORBIDDEN');
    expect(forbiddenRes.headers['access-control-allow-origin']).toBe(VERCEL_ADMIN_ORIGIN);

    // Request with valid admin credentials returns 200 OK
    const successRes = await request(app)
      .get('/api/v1/admin/auth/me')
      .set('Origin', VERCEL_ADMIN_ORIGIN)
      .set('Authorization', 'Bearer valid-admin-token');

    expect(successRes.status).toBe(200);
    expect(successRes.body.success).toBe(true);
    expect(successRes.body.data.email).toBe('admin@fitonus.com');
    expect(successRes.body.data.role).toBe('admin');
    expect(successRes.headers['access-control-allow-origin']).toBe(VERCEL_ADMIN_ORIGIN);

    // Request with valid cookie session returns 200 OK
    const cookieRes = await request(app)
      .get('/api/v1/admin/auth/me')
      .set('Origin', VERCEL_ADMIN_ORIGIN)
      .set('Cookie', 'fitonus_admin_token=valid-admin-token');

    expect(cookieRes.status).toBe(200);
    expect(cookieRes.body.data.role).toBe('admin');
  });

  // 7. Existing Mobile API behavior unaffected
  it('7. leaves mobile API and other allowed origins unaffected', async () => {
    const app = createTestApp();

    // Native mobile app request without Origin header
    const mobileNativeRes = await request(app)
      .get('/api/v1/workouts');

    expect(mobileNativeRes.status).toBe(200);
    expect(mobileNativeRes.body.data.items).toEqual(['Chest Day', 'Leg Day']);
    expect(mobileNativeRes.headers['access-control-allow-origin']).toBeUndefined();

    // Expo web / configured local dev origin
    const mobileWebRes = await request(app)
      .get('/api/v1/workouts')
      .set('Origin', MOBILE_DEV_ORIGIN);

    expect(mobileWebRes.status).toBe(200);
    expect(mobileWebRes.headers['access-control-allow-origin']).toBe(MOBILE_DEV_ORIGIN);
    expect(mobileWebRes.headers['access-control-allow-credentials']).toBe('true');

    // Local admin web dev origin
    const localAdminRes = await request(app)
      .options('/api/v1/admin/auth/me')
      .set('Origin', LOCAL_DEV_ORIGIN)
      .set('Access-Control-Request-Method', 'GET');

    expect(localAdminRes.status).toBe(204);
    expect(localAdminRes.headers['access-control-allow-origin']).toBe(LOCAL_DEV_ORIGIN);
  });
});
