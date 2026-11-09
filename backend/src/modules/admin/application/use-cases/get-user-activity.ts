import { AppError } from '../../../../shared/errors/app-error.js';
import type { AdminRepository, AdminUserActivityView } from '../ports.js';

export class GetUserActivityUseCase {
  constructor(private readonly deps: { adminRepo: AdminRepository }) {}

  async execute(input: { userId: string }): Promise<AdminUserActivityView> {
    if (!input.userId) {
      throw new AppError('validation', 'VALIDATION_FAILED', 'User ID is required');
    }
    return this.deps.adminRepo.getUserActivity(input.userId);
  }
}
