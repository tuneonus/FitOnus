import type { RequestHandler } from 'express';
import { assertPermission } from '../shared/auth/actor.js';
import type { Permission } from '../shared/auth/permissions.js';
import { requireActor } from './authenticate.js';

/** Route-level guard. Ownership rules that depend on the resource stay in use cases. */
export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    assertPermission(requireActor(req), permission);
    next();
  };
}
