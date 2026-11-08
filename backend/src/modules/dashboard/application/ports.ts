import type { DashboardSummary } from '../domain/dashboard-summary.js';

export interface DashboardRepository {
  getDashboardData(userId: string, timezone: string): Promise<DashboardSummary>;
}
