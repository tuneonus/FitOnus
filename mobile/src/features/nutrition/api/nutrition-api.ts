import { apiClient } from '@/services/api-client';
import type {
  BackendFoodView,
  BackendMealView,
  CreateCustomFoodInput,
  DailyNutritionView,
  FoodItem,
  LogMealInput,
  LogWaterInput,
  NutritionAnalyticsView,
  UpdateMealInput,
  WaterIntakeView,
} from '../types/nutrition';
import { mapBackendFoodToFoodItem } from '../utils/nutrition-calculator';
import { logger } from '@/utils/logger';

export interface SearchFoodsParams {
  q?: string;
  page?: number;
  limit?: number;
  verifiedOnly?: boolean;
}

export const nutritionApi = {
  /**
   * Fetch daily nutrition dashboard summary and logged meals.
   */
  async getDailyNutrition(date: string): Promise<DailyNutritionView> {
    const res = await apiClient.get('/nutrition/daily', { params: { date } });
    return res.data?.data;
  },

  /**
   * Search USDA verified foods and requesting user custom foods.
   */
  async searchFoods(params: SearchFoodsParams = {}): Promise<{
    foods: FoodItem[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const res = await apiClient.get('/nutrition/foods/search', { params });
    const data: BackendFoodView[] = res.data?.data || [];
    const meta = res.data?.meta || {};

    return {
      foods: data.map(mapBackendFoodToFoodItem),
      total: meta.total ?? data.length,
      page: meta.page ?? 1,
      totalPages: meta.totalPages ?? 1,
    };
  },

  /**
   * Fetch recently logged unique foods by this user.
   */
  async getRecentFoods(limit = 10): Promise<FoodItem[]> {
    const res = await apiClient.get('/nutrition/foods/recent', { params: { limit } });
    const data: BackendFoodView[] = res.data?.data || [];
    return data.map(mapBackendFoodToFoodItem);
  },

  /**
   * Retrieve detailed food specification by ID.
   */
  async getFoodById(id: string): Promise<FoodItem> {
    const res = await apiClient.get(`/nutrition/foods/${id}`);
    const food: BackendFoodView = res.data?.data;
    return mapBackendFoodToFoodItem(food);
  },

  /**
   * Look up a food item by exact barcode string.
   */
  async getFoodByBarcode(code: string): Promise<FoodItem> {
    const res = await apiClient.get(`/nutrition/foods/barcode/${encodeURIComponent(code)}`);
    const food: BackendFoodView = res.data?.data;
    return mapBackendFoodToFoodItem(food);
  },

  /**
   * Create a private user-owned custom food.
   */
  async createCustomFood(input: CreateCustomFoodInput): Promise<FoodItem> {
    const res = await apiClient.post('/nutrition/foods', input);
    const food: BackendFoodView = res.data?.data;
    return mapBackendFoodToFoodItem(food);
  },

  /**
   * Log a meal with item snapshots (server calculates macros from authoritative items).
   * Supports client-generated UUID for offline idempotency.
   */
  async logMeal(input: LogMealInput): Promise<BackendMealView> {
    const headers: Record<string, string> = {};
    if (input.id) {
      headers['Idempotency-Key'] = input.id;
    }
    const res = await apiClient.post('/nutrition/meals', input, { headers });
    return res.data?.data;
  },

  /**
   * Update an existing logged meal.
   */
  async updateMeal(id: string, input: UpdateMealInput): Promise<BackendMealView> {
    const res = await apiClient.put(`/nutrition/meals/${id}`, input);
    return res.data?.data;
  },

  /**
   * Retrieve a logged meal snapshot.
   */
  async getMeal(id: string): Promise<BackendMealView> {
    const res = await apiClient.get(`/nutrition/meals/${id}`);
    return res.data?.data;
  },

  /**
   * Log hydration intake with client UUID idempotency.
   */
  async logWater(input: LogWaterInput): Promise<WaterIntakeView> {
    const headers: Record<string, string> = {};
    if (input.id) {
      headers['Idempotency-Key'] = input.id;
    }
    const res = await apiClient.post('/nutrition/water', input, { headers });
    return res.data?.data;
  },

  /**
   * Retrieve user favorite foods.
   */
  async getFavorites(page = 1, limit = 50): Promise<FoodItem[]> {
    const res = await apiClient.get('/nutrition/favorites', { params: { page, limit } });
    const data: BackendFoodView[] = res.data?.data || [];
    return data.map((f) => ({ ...mapBackendFoodToFoodItem(f), isFavorite: true }));
  },

  /**
   * Add a food to user favorites.
   */
  async addFavorite(foodId: string): Promise<boolean> {
    const res = await apiClient.post('/nutrition/favorites', { foodId });
    return !!res.data?.success;
  },

  /**
   * Remove a food from user favorites.
   */
  async removeFavorite(foodId: string): Promise<boolean> {
    const res = await apiClient.delete(`/nutrition/favorites/${foodId}`);
    return !!res.data?.success;
  },

  /**
   * Retrieve nutrition trends and analytics.
   */
  async getNutritionAnalytics(
    range: 'week' | 'month' = 'week',
    endDate?: string
  ): Promise<NutritionAnalyticsView> {
    const res = await apiClient.get('/nutrition/analytics', {
      params: { range, endDate },
    });
    return res.data?.data;
  },
};
