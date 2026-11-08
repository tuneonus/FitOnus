import { DashboardRepository, type DashboardData } from '../api/dashboard-repository';
import { logger } from '@/utils/logger';

export const DashboardService = {
  getDashboardData: async (timezone?: string): Promise<DashboardData> => {
    try {
      const data = await DashboardRepository.getDashboardData(timezone);
      return data;
    } catch (error) {
      logger.error('Failed to fetch dashboard data from server', error);
      throw error;
    }
  },
};
