import type { Actor } from '../auth/actor.js';

/** Request properties populated by our middleware (authenticate, validate). */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor?: Actor;
      validated?: Record<string, unknown>;
    }
  }
}

export {};
