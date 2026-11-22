import { describe, expect, it, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { SignJWT } from 'jose';
import {
  createInternalServiceAuth,
  INTERNAL_TOOL_TOKEN_AUDIENCE,
  INTERNAL_TOOL_TOKEN_ISSUER,
  INTERNAL_TOOL_TOKEN_SCOPE,
  toolReplayCache,
} from '../../../src/modules/coach/interface/internal-tools.routes.js';
import { AppError } from '../../../src/shared/errors/app-error.js';

describe('Internal Tools Authentication Middleware', () => {
  const SECRET = 'test-secret-at-least-32-characters-long!';
  const authMiddleware = createInternalServiceAuth(SECRET);

  beforeEach(() => {
    toolReplayCache.clear();
  });

  async function createValidToken(overrides: Record<string, unknown> = {}): Promise<string> {
    const key = new TextEncoder().encode(SECRET);
    const now = Math.floor(Date.now() / 1000);
    const sub = (overrides.sub as string) || 'user-456';
    const jwt = new SignJWT({
      scope: INTERNAL_TOOL_TOKEN_SCOPE,
      rid: 'req-123',
      ...overrides,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(INTERNAL_TOOL_TOKEN_ISSUER)
      .setAudience(INTERNAL_TOOL_TOKEN_AUDIENCE)
      .setSubject(sub)
      .setIssuedAt(now)
      .setExpirationTime(now + 30)
      .setJti(crypto.randomUUID());

    return jwt.sign(key);
  }

  function mockRequest(authHeader?: string): Request {
    return {
      headers: authHeader ? { authorization: authHeader } : {},
    } as unknown as Request;
  }

  async function runAuth(req: Request): Promise<{ nextCalled: boolean; error: unknown }> {
    let nextCalled = false;
    let error: unknown = null;
    try {
      await (authMiddleware(req, {} as Response, (err?: unknown) => {
        if (err) {
          error = err;
        } else {
          nextCalled = true;
        }
      }) as unknown as Promise<void>);
    } catch (err: unknown) {
      error = err;
    }
    return { nextCalled, error };
  }

  it('rejects requests without Authorization header', async () => {
    const req = mockRequest();
    const { nextCalled, error } = await runAuth(req);

    expect(nextCalled).toBe(false);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('INVALID_TOKEN');
  });

  it('rejects non-Bearer Authorization headers', async () => {
    const req = mockRequest('Basic dXNlcjpwYXNz');
    const { nextCalled, error } = await runAuth(req);

    expect(nextCalled).toBe(false);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('INVALID_TOKEN');
  });

  it('rejects tokens signed with a different secret', async () => {
    const wrongKey = new TextEncoder().encode('wrong-secret-at-least-32-characters-long!');
    const token = await new SignJWT({ scope: INTERNAL_TOOL_TOKEN_SCOPE })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(INTERNAL_TOOL_TOKEN_ISSUER)
      .setAudience(INTERNAL_TOOL_TOKEN_AUDIENCE)
      .setSubject('user-456')
      .setIssuedAt()
      .setExpirationTime('30s')
      .setJti(crypto.randomUUID())
      .sign(wrongKey);

    const req = mockRequest(`Bearer ${token}`);
    const { nextCalled, error } = await runAuth(req);

    expect(nextCalled).toBe(false);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('INVALID_TOKEN');
  });

  it('rejects tokens with incorrect issuer', async () => {
    const key = new TextEncoder().encode(SECRET);
    const token = await new SignJWT({ scope: INTERNAL_TOOL_TOKEN_SCOPE })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('unauthorized-issuer')
      .setAudience(INTERNAL_TOOL_TOKEN_AUDIENCE)
      .setSubject('user-456')
      .setIssuedAt()
      .setExpirationTime('30s')
      .setJti(crypto.randomUUID())
      .sign(key);

    const req = mockRequest(`Bearer ${token}`);
    const { nextCalled, error } = await runAuth(req);

    expect(nextCalled).toBe(false);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('INVALID_TOKEN');
  });

  it('rejects tokens with incorrect audience', async () => {
    const key = new TextEncoder().encode(SECRET);
    const token = await new SignJWT({ scope: INTERNAL_TOOL_TOKEN_SCOPE })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(INTERNAL_TOOL_TOKEN_ISSUER)
      .setAudience('wrong-audience')
      .setSubject('user-456')
      .setIssuedAt()
      .setExpirationTime('30s')
      .setJti(crypto.randomUUID())
      .sign(key);

    const req = mockRequest(`Bearer ${token}`);
    const { nextCalled, error } = await runAuth(req);

    expect(nextCalled).toBe(false);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('INVALID_TOKEN');
  });

  it('rejects tokens with wrong scope', async () => {
    const token = await createValidToken({ scope: 'ai:coach:chat' });
    const req = mockRequest(`Bearer ${token}`);
    const { nextCalled, error } = await runAuth(req);

    expect(nextCalled).toBe(false);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('INVALID_TOKEN');
  });

  it('rejects expired tokens', async () => {
    const key = new TextEncoder().encode(SECRET);
    const past = Math.floor(Date.now() / 1000) - 100;
    const token = await new SignJWT({ scope: INTERNAL_TOOL_TOKEN_SCOPE })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(INTERNAL_TOOL_TOKEN_ISSUER)
      .setAudience(INTERNAL_TOOL_TOKEN_AUDIENCE)
      .setSubject('user-456')
      .setIssuedAt(past - 30)
      .setExpirationTime(past)
      .setJti(crypto.randomUUID())
      .sign(key);

    const req = mockRequest(`Bearer ${token}`);
    const { nextCalled, error } = await runAuth(req);

    expect(nextCalled).toBe(false);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('INVALID_TOKEN');
  });

  it('rejects replayed tokens (same jti used twice)', async () => {
    const token = await createValidToken();
    const req1 = mockRequest(`Bearer ${token}`);
    const { nextCalled: next1, error: error1 } = await runAuth(req1);
    expect(next1).toBe(true);
    expect(error1).toBeNull();

    const req2 = mockRequest(`Bearer ${token}`);
    const { nextCalled: next2, error: error2 } = await runAuth(req2);
    expect(next2).toBe(false);
    expect(error2).toBeInstanceOf(AppError);
    expect((error2 as AppError).code).toBe('INVALID_TOKEN');
  });

  it('accepts valid tokens and populates req.actor strictly with sub claim', async () => {
    const token = await createValidToken({ sub: 'user-athlete-1' });
    const req = mockRequest(`Bearer ${token}`);
    const { nextCalled, error } = await runAuth(req);

    expect(nextCalled).toBe(true);
    expect(error).toBeNull();
    expect(req.actor).toBeDefined();
    expect(req.actor?.userId).toBe('user-athlete-1');
    expect(req.actor?.role).toBe('member');
  });
});
