import { AppError } from '../../../../shared/errors/app-error.js';
import type { DashboardSummary } from '../../domain/dashboard-summary.js';
import type { DashboardRepository } from '../ports.js';

export interface GetDashboardSummaryInput {
  userId: string;
  timezone?: string | null;
}

export class GetDashboardSummaryUseCase {
  constructor(private readonly dashboardRepository: DashboardRepository) {}

  async execute(input: GetDashboardSummaryInput): Promise<DashboardSummary> {
    if (!input.userId || !input.userId.trim()) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'User ID is required');
    }
    const timezone = input.timezone || 'UTC';
    return await this.dashboardRepository.getDashboardData(input.userId.trim(), timezone);
  }
}
