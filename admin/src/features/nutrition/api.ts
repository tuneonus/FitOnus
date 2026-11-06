import { apiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types';
import type {
  AdminFood,
  CreateFoodInput,
  FoodListQuery,
  NutritionCatalogStats,
  UpdateFoodInput,
  VerifyFoodInput,
} from './types';

export const nutritionApi = {
  async getStats(): Promise<NutritionCatalogStats> {
    const res = await apiClient<NutritionCatalogStats>('/nutrition/stats', {
      method: 'GET',
    });
    return res.data;
  },

  async listFoods(
    params: FoodListQuery = {}
  ): Promise<{ foods: AdminFood[]; meta: ApiResponse<unknown>['meta'] }> {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', params.page.toString());
    if (params.limit) searchParams.set('limit', params.limit.toString());
    if (params.q) searchParams.set('q', params.q);
    if (params.dataSource) searchParams.set('dataSource', params.dataSource);
    if (params.verificationStatus) {
      searchParams.set('verificationStatus', params.verificationStatus);
    }
    if (params.isCustom !== undefined) {
      searchParams.set('isCustom', params.isCustom.toString());
    }
    if (params.includeDeleted !== undefined) {
      searchParams.set('includeDeleted', params.includeDeleted.toString());
    }

    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    const res = await apiClient<AdminFood[]>(`/nutrition/foods${query}`, {
      method: 'GET',
    });

    return {
      foods: res.data,
      meta: res.meta,
    };
  },

  async getFood(id: string, includeDeleted = false): Promise<AdminFood> {
    const query = includeDeleted ? '?includeDeleted=true' : '';
    const res = await apiClient<AdminFood>(`/nutrition/foods/${id}${query}`, {
      method: 'GET',
    });
    return res.data;
  },

  async createFood(data: CreateFoodInput): Promise<AdminFood> {
    const res = await apiClient<AdminFood>('/nutrition/foods', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async updateFood(id: string, data: UpdateFoodInput): Promise<AdminFood> {
    const res = await apiClient<AdminFood>(`/nutrition/foods/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async deleteFood(id: string): Promise<void> {
    await apiClient(`/nutrition/foods/${id}`, {
      method: 'DELETE',
    });
  },

  async verifyFood(id: string, data: VerifyFoodInput): Promise<AdminFood> {
    const res = await apiClient<AdminFood>(`/nutrition/foods/${id}/verify`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },
};

