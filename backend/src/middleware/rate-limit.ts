import type { Request, RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { AppConfig } from '../config/env.js';
import { AppError } from '../shared/errors/app-error.js';

const rejectWithAppError: RequestHandler = (_req, _res, next) =>
  next(new AppError('rate_limited', 'RATE_LIMITED', 'Too many requests. Try again later.'));

const clientIp = (req: Request): string => ipKeyGenerator(req.ip ?? 'unknown');

const bodyEmail = (req: Request): string => {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' ? email.trim().toLowerCase().slice(0, 254) : '';
};

export interface RateLimiters {
  global: RequestHandler;
  login: RequestHandler;
  register: RequestHandler;
  refresh: RequestHandler;
  sensitive: RequestHandler;
  aiCoach: RequestHandler;
  notificationsMember: RequestHandler;
  notificationDevices: RequestHandler;
  notificationsAdmin: RequestHandler;
}

/**
 * In-memory stores: correct for a single instance. With several replicas, plug a shared
 * store (e.g. Redis) into each limiter so budgets are not multiplied by the replica count.
 */
export function createRateLimiters(config: AppConfig['rateLimit']): RateLimiters {
  const base = {
    windowMs: config.windowMs,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: rejectWithAppError,
  } as const;

  // Per-user budgets where a bearer token is present (limiters run before authentication), else per IP.
  const byBearerOrIp = (req: Request): string => {
    const auth = req.headers.authorization;
    return auth && auth.length > 20 ? auth.slice(-24) : clientIp(req);
  };

  return {
    global: rateLimit({ ...base, limit: config.max, skip: (req) => req.path.startsWith('/health') }),
    // Keyed by IP + e-mail so one attacker cannot lock out an unrelated account from another network.
    login: rateLimit({
      ...base,
      limit: config.authMax,
      keyGenerator: (req) => `${clientIp(req)}|${bodyEmail(req)}`,
    }),
    register: rateLimit({ ...base, limit: config.authMax }),
    refresh: rateLimit({ ...base, limit: config.authMax * 6 }),
    sensitive: rateLimit({ ...base, limit: config.authMax }),
    notificationsMember: rateLimit({ ...base, limit: 300, keyGenerator: byBearerOrIp }),
    // Registration runs at launch, on token rotation and on sign-in/out: generous for real use, tight for abuse.
    notificationDevices: rateLimit({ ...base, limit: 40, keyGenerator: byBearerOrIp }),
    // Sends are deliberate human actions; this stops a stolen or scripted admin session from fanning out freely.
    notificationsAdmin: rateLimit({ ...base, limit: 60, keyGenerator: byBearerOrIp }),
    aiCoach: rateLimit({
      ...base,
      limit: 30, // 30 requests per 15-minute window
      keyGenerator: (req) => {
        const auth = req.headers.authorization;
        if (auth && auth.length > 20) return auth.slice(-24);
        return clientIp(req);
      },
    }),
  };
}
