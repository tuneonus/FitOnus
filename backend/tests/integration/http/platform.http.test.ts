import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../helpers/test-app.js';

describe('platform behaviour', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext({ BODY_LIMIT: '1kb' });
  });
  afterAll(() => ctx.close());

  const api = () => request(ctx.app);

  it('reports liveness and database readiness', async () => {
    expect((await api().get('/health/live')).body).toEqual({
      success: true,
      data: { status: 'ok' },
      message: 'OK',
    });
    expect((await api().get('/health/ready')).status).toBe(200);
  });

  it('reports not-ready while shutting down', async () => {
    const shutdownCtx = await createTestContext();
    shutdownCtx.container.lifecycle.beginShutdown();
    const response = await request(shutdownCtx.app).get('/health/ready');
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
    await shutdownCtx.close();
  });

  it('sets security headers and hides the framework', async () => {
    const response = await api().get('/health/live');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toBeDefined();
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('allows configured CORS origins only', async () => {
    const allowed = await api()
      .options('/api/v1/users')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const denied = await api()
      .options('/api/v1/users')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'GET');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('returns enveloped 404, 405, invalid JSON and payload-too-large errors', async () => {
    const missing = await api().get('/api/v1/nothing-here');
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ success: false, error: { code: 'ROUTE_NOT_FOUND' } });

    const wrongMethod = await api().put('/api/v1/auth/login');
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.allow).toBe('POST');

    const malformed = await api()
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');
    expect(malformed.body.error.code).toBe('INVALID_JSON');

    const huge = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'a@b.co', password: 'x'.repeat(2_000) });
    expect(huge.status).toBe(413);
  });

  it('publishes an OpenAPI document covering every route', async () => {
    const response = await api().get('/api/v1/openapi.json');
    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe('3.1.0');
    const documented = Object.entries(response.body.paths as Record<string, Record<string, unknown>>).flatMap(
      ([path, operations]) => Object.keys(operations).map((method) => `${method.toUpperCase()} ${path}`),
    );
    const registered = ctx.container.routeGroups.flatMap((group) =>
      group.routes.map((route) => {
        const full = route.path === '/' ? group.basePath : `${group.basePath}${route.path}`;
        return `${route.method.toUpperCase()} ${full.replace(/:([A-Za-z0-9_]+)/g, '{$1}')}`;
      }),
    );
    expect(documented.sort()).toEqual(registered.sort());
    expect(response.body.paths['/api/v1/users'].post['x-required-permission']).toBe('users:create');
  });
});
