import { assertSelfOrPermission, type Actor } from '../../../../shared/auth/actor.js';
import { conflict, notFound } from '../../../../shared/errors/app-error.js';
import { normalizeDisplayName } from '../../domain/user.js';
import type { UserRepository } from '../ports.js';
import { toUserView, type UserView } from '../user-view.js';

export interface UpdateUserProfileInput {
  displayName: string;
  /** The version the client last read. A stale version yields VERSION_CONFLICT instead of a lost update. */
  version: number;
}

export class UpdateUserProfileUseCase {
  constructor(private readonly deps: { users: UserRepository }) {}

  async execute(actor: Actor, userId: string, input: UpdateUserProfileInput): Promise<UserView> {
    assertSelfOrPermission(actor, userId, 'users:update');
    const displayName = normalizeDisplayName(input.displayName);

    const updated = await this.deps.users.updateProfile(userId, input.version, { displayName });
    if (updated) return toUserView(updated);

    const current = await this.deps.users.findById(userId);
    if (!current) throw notFound('USER_NOT_FOUND', 'User not found.');
    throw conflict('VERSION_CONFLICT', 'The user was modified by another request. Reload and retry.', {
      currentVersion: current.version,
    });
  }
}
