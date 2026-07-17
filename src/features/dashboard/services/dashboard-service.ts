import { DashboardRepository, DashboardData } from '../api/dashboard-repository';
import { logger } from '@/utils/logger';

export const DashboardService = {
  getDashboardData: async (): Promise<DashboardData> => {
    try {
      const data = await DashboardRepository.getDashboardData();
      
      // Perform any business logic here.
      // E.g., formatting dates, converting units, or calculating dynamic fields.
      // For Phase 3, we just pass the mock data through.
      
      return data;
    } catch (error) {
      logger.error('Failed to fetch dashboard data', error);
      throw error;
    }
  }
};
