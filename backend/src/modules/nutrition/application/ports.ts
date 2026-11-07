import type { Food, FoodDataSource, FoodProps, VerificationStatus } from '../domain/food.js';
import type { Meal } from '../domain/meal.js';
import type { WaterIntake } from '../domain/water.js';

export interface FoodSearchFilter {
  query?: string;
  userId?: string | null;
  offset: number;
  limit: number;
  isVerifiedOnly?: boolean;
  dataSource?: FoodDataSource;
  verificationStatus?: VerificationStatus;
  isCustom?: boolean;
  includeDeleted?: boolean;
}

export interface NutritionCatalogStats {
  totalVerifiedFoods: number;
  totalCustomFoods: number;
  totalMealsLogged: number;
  totalMealItemsLogged: number;
  totalWaterLogs: number;
  verifiedFoodsBySource: Record<string, number>;
}

export interface IFoodRepository {
  findById(id: string, requestingUserId?: string | null, includeDeleted?: boolean): Promise<Food | null>;
  findByBarcode(barcode: string, requestingUserId?: string | null): Promise<Food | null>;
  search(filter: FoodSearchFilter): Promise<{ foods: Food[]; total: number }>;
  listRecent(userId: string, limit: number): Promise<Food[]>;
  listFavorites(userId: string, limit: number, offset: number): Promise<{ foods: Food[]; total: number }>;
  create(food: Food): Promise<Food>;
  update(id: string, patch: Partial<FoodProps>, updatingUserId?: string | null): Promise<Food | null>;
  softDelete(id: string, deletingUserId?: string | null): Promise<boolean>;
  countVerified(): Promise<number>;
  countCustom(userId?: string): Promise<number>;
  getCatalogStats(): Promise<NutritionCatalogStats>;
}

export interface INutritionAuditLogger {
  logAction(
    adminId: string,
    action: string,
    details: Record<string, unknown>,
    targetUserId?: string | null,
    ipAddress?: string | null,
    userAgent?: string | null,
  ): Promise<void>;
}

export interface IMealRepository {
  findById(id: string, userId?: string): Promise<Meal | null>;
  listByDate(userId: string, date: string): Promise<Meal[]>;
  listDateRange(userId: string, startDate: string, endDate: string): Promise<Meal[]>;
  create(meal: Meal): Promise<{ meal: Meal; created: boolean }>;
  update(id: string, userId: string, meal: Meal): Promise<Meal | null>;
  softDelete(id: string, userId: string): Promise<boolean>;
  getMostLoggedFoods(
    userId: string,
    limit: number,
    sinceDate?: string,
  ): Promise<{ foodName: string; count: number; totalCalories: number }[]>;
  countLoggedDays(userId: string, startDate: string, endDate: string): Promise<number>;
}

export interface IWaterRepository {
  findById(id: string): Promise<WaterIntake | null>;
  create(entry: WaterIntake): Promise<{ entry: WaterIntake; created: boolean }>;
  listByDate(userId: string, date: string): Promise<WaterIntake[]>;
  getTotalByDate(userId: string, date: string): Promise<number>;
  getTotalDateRange(
    userId: string,
    startDate: string,
    endDate: string,
  ): Promise<{ date: string; totalMl: number }[]>;
}

export interface UserProfileNutritionTargets {
  dailyCalorieTarget: number | null;
  dailyProteinGrams: number | null;
}

export interface IUserProfileTargetPort {
  findTargetsByUserId(userId: string): Promise<UserProfileNutritionTargets | null>;
}

export interface IFoodFavoriteRepository {
  addFavorite(userId: string, foodId: string): Promise<boolean>;
  removeFavorite(userId: string, foodId: string): Promise<boolean>;
  isFavorite(userId: string, foodId: string): Promise<boolean>;
  listFavoriteFoodIds(userId: string): Promise<string[]>;
}
