import { AppError } from '../../../../shared/errors/app-error.js';
import type { AdminRepository, AdminUserDetailView } from '../ports.js';

export class GetAdminUserUseCase {
  constructor(private readonly deps: { adminRepo: AdminRepository }) {}

  async execute(userId: string): Promise<AdminUserDetailView> {
    const detail = await this.deps.adminRepo.getUserDetail(userId);
    if (!detail) {
      throw new AppError('not_found', 'USER_NOT_FOUND', 'User not found.');
    }
    return detail;
  }
}
