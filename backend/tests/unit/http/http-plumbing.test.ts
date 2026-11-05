import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorHandler, notFoundHandler } from '../../../src/middleware/error-handler.js';
import { requestContext } from '../../../src/middleware/request-context.js';
import { getValidated } from '../../../src/middleware/validate.js';
import { createActor } from '../../../src/shared/auth/actor.js';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { buildOpenApiDocument } from '../../../src/shared/http/openapi.js';
import { buildRouter, defineRoute, type RouteGroup } from '../../../src/shared/http/route.js';
import { createLogger } from '../../../src/shared/logging/logger.js';

const echoRequest = { body: z.strictObject({ name: z.string().min(1) }) };

const group: RouteGroup = {
  basePath: '/things',
  routes: [
    defineRoute({
      method: 'post',
      path: '/',
      summary: 'Echo',
      tags: ['Test'],
      access: { kind: 'public' },
      request: echoRequest,
      response: {
        status: 201,
        description: 'ok',
        message: 'Created',
        schema: z.object({ name: z.string() }),
      },
      handler: (req) => {
        const { body } = getValidated(req, echoRequest);
        // The extra field must be stripped by the response schema.
        return Promise.resolve({ data: { name: body.name, secret: 'never-sent' } as { name: string } });
      },
    }),
    defineRoute({
      method: 'get',
      path: '/admin',
      summary: 'Needs permission',
      tags: ['Test'],
      access: { kind: 'permission', permission: 'users:read' },
      response: { status: 200, description: 'ok', message: 'OK', schema: z.object({}) },
      handler: () => Promise.resolve({ data: {} }),
    }),
    defineRoute({
      method: 'get',
      path: '/boom',
      summary: 'Fails',
      tags: ['Test'],
      access: { kind: 'public' },
      response: { status: 200, description: 'ok', message: 'OK', schema: z.object({}) },
      handler: () => Promise.reject(new Error('database password is hunter2')),
    }),
    defineRoute({
      method: 'get',
      path: '/conflict',
      summary: 'Conflicts',
      tags: ['Test'],
      access: { kind: 'public' },
      response: { status: 200, description: 'ok', message: 'OK', schema: z.object({}) },
      handler: () =>
        Promise.reject(new AppError('conflict', 'VERSION_CONFLICT', 'Stale', { currentVersion: 3 })),
    }),
  ],
};

function app(role: 'admin' | 'member' | null = null) {
  const instance = express();
  instance.use(requestContext(createLogger({ level: 'silent', pretty: false })));
  instance.use(express.json({ limit: '1kb' }));
  const authenticate: express.RequestHandler = (req, _res, next) => {
    if (!role) throw new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication is required.');
    req.actor = createActor({ userId: 'u', sessionId: 's', role });
    next();
  };
  instance.use(group.basePath, buildRouter(group.routes, { authenticate }));
  instance.use(notFoundHandler);
  instance.use(errorHandler);
  return instance;
}

describe('route builder, validation and error envelope', () => {
  it('wraps responses in the success envelope and strips undeclared fields', async () => {
    const response = await request(app()).post('/things').send({ name: 'x' });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ success: true, data: { name: 'x' }, message: 'Created' });
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('returns validation details with locations', async () => {
    const response = await request(app()).post('/things').send({ name: '', extra: true });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ location: 'body', path: 'name' })]),
    );
    expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
  });

  it('maps malformed JSON and oversized bodies', async () => {
    const malformed = await request(app())
      .post('/things')
      .set('Content-Type', 'application/json')
      .send('{"name":');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('INVALID_JSON');

    const large = await request(app())
      .post('/things')
      .send({ name: 'x'.repeat(5_000) });
    expect(large.status).toBe(413);
    expect(large.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('enforces declared access before running the handler', async () => {
    expect((await request(app(null)).get('/things/admin')).status).toBe(401);
    expect((await request(app('member')).get('/things/admin')).body.error.code).toBe('FORBIDDEN');
    expect((await request(app('admin')).get('/things/admin')).status).toBe(200);
  });

  it('hides internal error details and keeps safe AppError details', async () => {
    const internal = await request(app()).get('/things/boom');
    expect(internal.status).toBe(500);
    expect(internal.body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      requestId: expect.any(String),
    });
    expect(JSON.stringify(internal.body)).not.toContain('hunter2');

    const conflict = await request(app()).get('/things/conflict');
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.details).toEqual({ currentVersion: 3 });
  });

  it('answers 405 with Allow for known paths and 404 for unknown ones', async () => {
    const wrongMethod = await request(app()).delete('/things');
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.allow).toBe('POST');
    expect((await request(app()).get('/nope')).body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('reuses a well-formed incoming request id and replaces unsafe ones', async () => {
    const reused = await request(app())
      .post('/things')
      .set('X-Request-Id', 'client-req-123')
      .send({ name: 'x' });
    expect(reused.headers['x-request-id']).toBe('client-req-123');
    const replaced = await request(app())
      .post('/things')
      .set('X-Request-Id', '<script> id')
      .send({ name: 'x' });
    expect(replaced.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('OpenAPI generation', () => {
  it('documents paths, parameters, security and permissions from the same specs', () => {
    const document = buildOpenApiDocument([group], { title: 't', version: '1' }) as {
      paths: Record<string, Record<string, Record<string, unknown>>>;
    };
    expect(document.paths['/things']?.post?.requestBody).toBeDefined();
    expect(document.paths['/things/admin']?.get?.security).toEqual([{ bearerAuth: [] }]);
    expect(document.paths['/things/admin']?.get?.['x-required-permission']).toBe('users:read');
    expect(Object.keys(document.paths['/things/admin']?.get?.responses as object)).toEqual(
      expect.arrayContaining(['200', '401', '403', '500']),
    );
  });
});
