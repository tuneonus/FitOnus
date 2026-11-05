import type { Request, RequestHandler } from 'express';
import type { Actor } from '../shared/auth/actor.js';
import { unauthorized } from '../shared/errors/app-error.js';

/** Resolves a bearer token into an Actor, or throws. Supplied by the auth module. */
export type AccessTokenAuthenticator = (token: string) => Promise<Actor>;

const BEARER = /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/;

function extractTokenFromRequest(req: Request): string | null {
  const match = BEARER.exec(req.headers.authorization ?? '');
  if (match) return match[1]!;

  const rawCookie = req.headers.cookie;
  if (rawCookie) {
    const cookieMatch = /(?:^|;\s*)fitonus_admin_token=([^;]+)/.exec(rawCookie);
    if (cookieMatch?.[1]) return decodeURIComponent(cookieMatch[1]);
  }
  return null;
}

export function createAuthenticate(authenticator: AccessTokenAuthenticator): RequestHandler {
  return async (req, _res, next) => {
    const token = extractTokenFromRequest(req);
    if (!token) throw unauthorized('UNAUTHENTICATED', 'Authentication is required.');
    req.actor = await authenticator(token);
    next();
  };
}

export function requireActor(req: Request): Actor {
  if (!req.actor) throw unauthorized('UNAUTHENTICATED', 'Authentication is required.');
  return req.actor;
}
