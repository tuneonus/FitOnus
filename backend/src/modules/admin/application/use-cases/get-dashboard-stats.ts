import type { DashboardStats } from '../../domain/dashboard-stats.js';
import type { AdminRepository } from '../ports.js';

export class GetDashboardStatsUseCase {
  constructor(private readonly deps: { adminRepo: AdminRepository }) {}

  async execute(input?: { timeframe?: string }): Promise<DashboardStats> {
    return this.deps.adminRepo.getDashboardStats(input?.timeframe);
  }
}
