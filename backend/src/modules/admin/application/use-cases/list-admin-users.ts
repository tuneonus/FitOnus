import type { PaginationMeta } from '../../../../shared/pagination/pagination.js';
import type { AdminRepository, AdminUserListItemView, ListAdminUsersQuery } from '../ports.js';

export class ListAdminUsersUseCase {
  constructor(private readonly deps: { adminRepo: AdminRepository }) {}

  async execute(
    query: ListAdminUsersQuery,
  ): Promise<{ items: AdminUserListItemView[]; meta: PaginationMeta }> {
    return this.deps.adminRepo.listUsers(query);
  }
}
