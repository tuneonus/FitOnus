import { forbidden } from '../errors/app-error.js';
import { permissionsForRole, type Permission, type Role } from './permissions.js';

/** The authenticated caller, resolved from a verified access token and a live session. */
export interface Actor {
  readonly userId: string;
  readonly sessionId: string;
  readonly role: Role;
  readonly permissions: ReadonlySet<Permission>;
}

export const createActor = (input: { userId: string; sessionId: string; role: Role }): Actor => ({
  ...input,
  permissions: new Set(permissionsForRole(input.role)),
});

export const hasPermission = (actor: Actor, permission: Permission): boolean =>
  actor.permissions.has(permission);

export function assertPermission(actor: Actor, permission: Permission): void {
  if (!hasPermission(actor, permission)) throw forbidden();
}

/** Ownership rule: callers may act on their own resource, or anyone's with `permission`. */
export function assertSelfOrPermission(actor: Actor, ownerId: string, permission: Permission): void {
  if (actor.userId !== ownerId && !hasPermission(actor, permission)) throw forbidden();
}
