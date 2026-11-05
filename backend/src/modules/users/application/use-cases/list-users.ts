import { assertPermission, type Actor } from '../../../../shared/auth/actor.js';
import type { Page } from '../../../../shared/pagination/pagination.js';
import type { UserListQuery, UserRepository } from '../ports.js';
import { toUserView, type UserView } from '../user-view.js';

export class ListUsersUseCase {
  constructor(private readonly deps: { users: UserRepository }) {}

  async execute(actor: Actor, query: UserListQuery): Promise<Page<UserView>> {
    assertPermission(actor, 'users:read');
    const page = await this.deps.users.list(query);
    return { items: page.items.map(toUserView), total: page.total };
  }
}
