import type { RequestHandler } from 'express';
import request from 'supertest';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.js';
import { loadConfig } from '../../../src/config/env.js';
import type { Container } from '../../../src/container.js';
import { callPythonAi, pythonUsageSchema } from '../../../src/shared/ai/python-ai-call.js';
import { PythonAiClient } from '../../../src/shared/ai/python-ai-client.js';
import { defineRoute } from '../../../src/shared/http/route.js';
import { createCapturingLogger } from '../../helpers/capture-logger.js';
import {
  json,
  okCoachReply,
  startFakePythonServer,
  type FakePythonServer,
} from '../../helpers/fake-python-ai-server.js';

/**
 * End to end through the REAL `createApp` middleware stack (request id -> helmet -> CORS -> JSON body
 * parser -> correlation binding -> routes): the id the app receives in `X-Request-Id` is the id Python
 * receives in `X-Correlation-Id`. It fails if the binding is removed from `createApp` or the id stops
 * reaching the AI client; a JSON body is sent so the body parser really runs before the route.
 */

const SECRET = 'unit-test-secret-unit-test-secret-1234';
const USER = '11111111-1111-4111-8111-111111111111';

const config = loadConfig({
  DATABASE_URL: 'postgres://app:pw@localhost:5432/app_dev',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  HMAC_SECRET: 'b'.repeat(40),
  JWT_ISSUER: 'issuer',
  JWT_AUDIENCE: 'audience',
  LOG_LEVEL: 'silent',
});

const passThrough: RequestHandler = (_req, _res, next) => next();
const replySchema = z.object({ outcome: z.string(), usage: pythonUsageSchema });

describe('correlation id: HTTP request -> Node AI call -> Python', () => {
  let server: FakePythonServer;
  let capture: ReturnType<typeof createCapturingLogger>;

  beforeEach(async () => {
    server = await startFakePythonServer((_req, res) => json(res, 200, okCoachReply()));
    capture = createCapturingLogger();
  });
  afterEach(async () => {
    await server.close();
  });

  const buildApp = () => {
    const client = new PythonAiClient({ baseUrl: server.url, serviceSecret: SECRET });
    const route = defineRoute({
      method: 'post',
      path: '/ask',
      summary: 'Test route that makes one AI call',
      tags: ['test'],
      access: { kind: 'public' },
      response: { status: 200, description: 'ok', message: 'ok', schema: z.object({ ok: z.boolean() }) },
      handler: async (req) => {
        const body = req.body as { marker?: string };
        await callPythonAi({
          client,
          path: '/internal/v1/ai/coach/chat',
          scope: 'ai:coach:chat',
          userId: USER,
          requestId: `chat-${body.marker ?? 'none'}`,
          timeoutMs: 2_000,
          body,
          schema: replySchema,
          feature: 'coach_chat',
          logger: capture.logger,
          label: 'Python coach chat',
          unavailableMessage: 'unavailable',
        });
        return { data: { ok: true } };
      },
    });
    const container = {
      routeGroups: [{ basePath: '/api/v1/test', routes: [route] }],
      authenticate: passThrough,
      rateLimiters: { global: passThrough },
    } as unknown as Container;
    return createApp({ config, logger: capture.logger, container });
  };

  it('forwards the id the client sent in X-Request-Id, and the AI events carry it too', async () => {
    const response = await request(buildApp())
      .post('/api/v1/test/ask')
      .set('X-Request-Id', 'mobile-request-1234')
      .send({ marker: 'one', message: 'a JSON body, so body-parser really runs' });

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toBe('mobile-request-1234');
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]!.headers['x-correlation-id']).toBe('mobile-request-1234');
    expect(server.requests[0]!.headers['x-request-id']).toBe('chat-one'); // the per-call id is unchanged
    expect(capture.events('ai.call.completed')[0]).toMatchObject({
      correlationId: 'mobile-request-1234',
      aiRequestId: 'chat-one',
    });
  });

  it('forwards the generated id when the client sent none (it matches the X-Request-Id the client gets back)', async () => {
    const response = await request(buildApp()).post('/api/v1/test/ask').send({ marker: 'two' });

    const received = response.headers['x-request-id'] as string;
    expect(received).toMatch(/^[0-9a-f-]{36}$/);
    expect(server.requests[0]!.headers['x-correlation-id']).toBe(received);
  });

  it('never forwards an unsafe client-supplied id (it is replaced before it can reach a header)', async () => {
    const response = await request(buildApp())
      .post('/api/v1/test/ask')
      .set('X-Request-Id', 'bad id with spaces & <script>')
      .send({ marker: 'three' });

    const received = response.headers['x-request-id'] as string;
    expect(received).not.toContain('script');
    expect(server.requests[0]!.headers['x-correlation-id']).toBe(received);
  });

  it('keeps simultaneous requests apart', async () => {
    const app = buildApp();
    const ids = Array.from({ length: 6 }, (_, index) => `mobile-request-${index}-abcdef`);

    await Promise.all(
      ids.map((id, index) =>
        request(app)
          .post('/api/v1/test/ask')
          .set('X-Request-Id', id)
          .send({ marker: String(index) }),
      ),
    );

    expect(server.requests).toHaveLength(6);
    for (const sent of server.requests) {
      const marker = (sent.body as { marker: string }).marker;
      expect(sent.headers['x-correlation-id']).toBe(`mobile-request-${marker}-abcdef`);
    }
  });

  it('the HTTP access line and the AI event share the id, so one search finds both', async () => {
    await request(buildApp())
      .post('/api/v1/test/ask')
      .set('X-Request-Id', 'mobile-request-join')
      .send({ marker: 'four' });

    const access = capture
      .entries()
      .find((entry) => (entry.req as { id?: string } | undefined)?.id === 'mobile-request-join');
    expect(access).toBeDefined();
    expect(capture.events('ai.call.completed')[0]!.correlationId).toBe('mobile-request-join');
  });
});
