import { assertSelfOrPermission, type Actor } from '../../../../shared/auth/actor.js';
import { notFound } from '../../../../shared/errors/app-error.js';
import type { UserRepository } from '../ports.js';
import { toUserView, type UserView } from '../user-view.js';

/** Users may read their own record; reading others requires `users:read`. */
export class GetUserUseCase {
  constructor(private readonly deps: { users: UserRepository }) {}

  async execute(actor: Actor, userId: string): Promise<UserView> {
    assertSelfOrPermission(actor, userId, 'users:read');
    const user = await this.deps.users.findById(userId);
    if (!user) throw notFound('USER_NOT_FOUND', 'User not found.');
    return toUserView(user);
  }
}
