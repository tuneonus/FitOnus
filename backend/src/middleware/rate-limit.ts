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
  };
}
