import type { Food, FoodDataSource, FoodProps, VerificationStatus } from '../domain/food.js';
import type { Meal } from '../domain/meal.js';
import type { WaterIntake } from '../domain/water.js';
import type { MealPhotoAnalysisResult } from '../domain/meal-photo.types.js';
import type { MultimodalContextHint, MultimodalMealAnalysisResult } from '../domain/multimodal-meal.types.js';
import type { VoiceMealParseResult } from '../domain/voice-meal.types.js';

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
  /** Deleted meals are invisible unless `includeDeleted` is set (delete and restore need to see them). */
  findById(id: string, userId?: string, includeDeleted?: boolean): Promise<Meal | null>;
  listByDate(userId: string, date: string): Promise<Meal[]>;
  listDateRange(userId: string, startDate: string, endDate: string): Promise<Meal[]>;
  create(meal: Meal): Promise<{ meal: Meal; created: boolean }>;
  update(id: string, userId: string, meal: Meal): Promise<Meal | null>;
  /** Marks the meal deleted. False when the user has no such live meal. The row, its id and its items stay. */
  softDelete(id: string, userId: string): Promise<boolean>;
  /** Undoes `softDelete`: the same meal, same id, same item snapshots. False when it is not currently deleted. */
  restore(id: string, userId: string): Promise<boolean>;
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
  /** Removes one of the user's entries. False when it no longer exists. Re-creating it with the same id is the undo. */
  delete(id: string, userId: string): Promise<boolean>;
  listByDate(userId: string, date: string): Promise<WaterIntake[]>;
  getTotalByDate(userId: string, date: string): Promise<number>;
  getTotalDateRange(
    userId: string,
    startDate: string,
    endDate: string,
  ): Promise<{ date: string; totalMl: number }[]>;
}

/**
 * A member's daily targets exactly as the diary shows them. They come from one resolver (`resolveDailyTargets` in the
 * profile module), so the diary, the dashboard and the analytics agree. Nothing is invented: when the member has no
 * saved calorie target and the profile is too thin to estimate one, the food targets are all null.
 */
export interface UserProfileNutritionTargets {
  /** Where calories, protein, carbs and fat came from; null when none are known. */
  source: 'saved' | 'estimated' | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  /** The member's own water target, else 35 ml/kg of their weight as a starting estimate, else null. */
  waterMl: number | null;
  waterSource: 'saved' | 'estimated' | null;
}

export interface IUserProfileTargetPort {
  findTargetsByUserId(userId: string): Promise<UserProfileNutritionTargets>;
}

/** The member's own nutrition settings (today: the daily water target). */
export interface INutritionSettingsRepository {
  /** Saves the member's daily water target in ml, or clears it (null) so the estimate applies again. Idempotent. */
  saveWaterTarget(userId: string, targetMl: number | null): Promise<void>;
}

export interface IFoodFavoriteRepository {
  addFavorite(userId: string, foodId: string): Promise<boolean>;
  removeFavorite(userId: string, foodId: string): Promise<boolean>;
  isFavorite(userId: string, foodId: string): Promise<boolean>;
  listFavoriteFoodIds(userId: string): Promise<string[]>;
}

/** Turns a meal photo into detected food items. Implemented by `PythonMealPhotoService` (the Python AI backend). */
export interface MealPhotoAnalyzer {
  analyzePhoto(
    image: { mimeType: string; base64: string },
    mealType?: string,
    notes?: string,
  ): Promise<MealPhotoAnalysisResult>;
}

/** Turns a spoken or typed meal description into food items. Implemented by `PythonVoiceMealService` (the Python AI backend). */
export interface VoiceMealParser {
  parseVoiceMeal(params: {
    transcript?: string;
    audio?: { mimeType: string; base64: string };
    lang?: string;
    mealType?: string;
  }): Promise<VoiceMealParseResult>;
}

/** Unified multimodal (image + audio + text) meal analyzer. Implemented by `PythonMultimodalMealService`. */
export interface MultimodalMealAnalyzer {
  analyzeMultimodal(params: {
    image?: { mimeType: string; base64: string };
    audio?: { mimeType: string; base64: string };
    transcript?: string;
    context?: MultimodalContextHint;
    signal?: AbortSignal;
  }): Promise<MultimodalMealAnalysisResult>;
}
