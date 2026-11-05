import type { DashboardStats } from '../../domain/dashboard-stats.js';
import type { AdminRepository } from '../ports.js';

export class GetDashboardStatsUseCase {
  constructor(private readonly deps: { adminRepo: AdminRepository }) {}

  async execute(): Promise<DashboardStats> {
    return this.deps.adminRepo.getDashboardStats();
  }
}
