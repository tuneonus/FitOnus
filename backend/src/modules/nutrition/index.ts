export * from './domain/food.js';
export * from './domain/meal.js';
export * from './domain/water.js';
export * from './domain/favorite.js';
export * from './domain/nutrition-calculator.js';
export * from './domain/meal-photo.types.js';
export * from './domain/voice-meal.types.js';
export * from './application/ports.js';
export * from './application/nutrition-view.js';
export * from './application/use-cases/search-foods.js';
export * from './application/use-cases/get-food-details.js';
export * from './application/use-cases/create-custom-food.js';
export * from './application/use-cases/log-meal.js';
export * from './application/use-cases/update-meal.js';
export * from './application/use-cases/get-meal.js';
export * from './application/use-cases/get-daily-nutrition.js';
export * from './application/use-cases/log-water.js';
export * from './application/use-cases/get-nutrition-analytics.js';
export * from './application/use-cases/manage-food-favorites.js';
export * from './application/use-cases/get-recent-foods.js';
export * from './application/use-cases/admin-manage-food.js';
export * from './application/use-cases/admin-get-nutrition-stats.js';
export * from './application/use-cases/analyze-meal-photo.js';
export * from './application/use-cases/parse-voice-meal.js';
export * from './infrastructure/pg-food-repository.js';
export * from './infrastructure/pg-meal-repository.js';
export * from './infrastructure/pg-water-repository.js';
export * from './infrastructure/pg-favorite-repository.js';
export * from './infrastructure/pg-user-profile-target-adapter.js';
export * from './infrastructure/nutrition-audit-logger.js';
export * from './infrastructure/gemini-meal-photo-service.js';
export * from './infrastructure/gemini-voice-meal-service.js';
export * from './interface/nutrition.schemas.js';
export * from './interface/nutrition.controller.js';
export * from './interface/nutrition.routes.js';
export * from './interface/meal-photo.schemas.js';
export * from './interface/voice-meal.schemas.js';
export * from './interface/admin-nutrition.schemas.js';
export * from './interface/admin-nutrition.controller.js';
export * from './interface/admin-nutrition.routes.js';

import type { SqlExecutor } from '../../database/transaction.js';
import type { UnitOfWork } from '../../shared/application/unit-of-work.js';
import type { RouteGroup } from '../../shared/http/route.js';
import type { GeminiClient } from '../coach/infrastructure/gemini-client.js';
import { GeminiMealPhotoService } from './infrastructure/gemini-meal-photo-service.js';
import { GeminiVoiceMealService } from './infrastructure/gemini-voice-meal-service.js';
import { AnalyzeMealPhotoUseCase } from './application/use-cases/analyze-meal-photo.js';
import { ParseVoiceMealUseCase } from './application/use-cases/parse-voice-meal.js';
import { GetDailyNutritionUseCase } from './application/use-cases/get-daily-nutrition.js';
import { SearchFoodsUseCase } from './application/use-cases/search-foods.js';
import { GetRecentFoodsUseCase } from './application/use-cases/get-recent-foods.js';
import { GetFoodDetailsUseCase } from './application/use-cases/get-food-details.js';
import { CreateCustomFoodUseCase } from './application/use-cases/create-custom-food.js';
import { LogMealUseCase } from './application/use-cases/log-meal.js';
import { UpdateMealUseCase } from './application/use-cases/update-meal.js';
import { GetMealUseCase } from './application/use-cases/get-meal.js';
import { LogWaterUseCase } from './application/use-cases/log-water.js';
import { GetNutritionAnalyticsUseCase } from './application/use-cases/get-nutrition-analytics.js';
import { ManageFoodFavoritesUseCase } from './application/use-cases/manage-food-favorites.js';
import { AdminManageFoodUseCase } from './application/use-cases/admin-manage-food.js';
import { AdminGetNutritionStatsUseCase } from './application/use-cases/admin-get-nutrition-stats.js';
import { PgFoodRepository } from './infrastructure/pg-food-repository.js';
import { PgMealRepository } from './infrastructure/pg-meal-repository.js';
import { PgWaterRepository } from './infrastructure/pg-water-repository.js';
import { PgFavoriteRepository } from './infrastructure/pg-favorite-repository.js';
import { PgUserProfileTargetAdapter } from './infrastructure/pg-user-profile-target-adapter.js';
import { PgNutritionAuditLogger } from './infrastructure/nutrition-audit-logger.js';
import { createNutritionMemberController } from './interface/nutrition.controller.js';
import { createNutritionMemberRoutes } from './interface/nutrition.routes.js';
import { createNutritionAdminController } from './interface/admin-nutrition.controller.js';
import { createNutritionAdminRoutes } from './interface/admin-nutrition.routes.js';

export interface NutritionModule {
  memberRoutes: RouteGroup;
  adminRoutes?: RouteGroup;
  foodRepo: PgFoodRepository;
  mealRepo: PgMealRepository;
  waterRepo: PgWaterRepository;
  favoriteRepo: PgFavoriteRepository;
  targetAdapter: PgUserProfileTargetAdapter;
  auditLogger: PgNutritionAuditLogger;
}

export interface CreateNutritionModuleOptions {
  basePath?: string;
  memberBasePath?: string;
  adminBasePath?: string;
  db: SqlExecutor;
  uow: UnitOfWork;
  geminiClient?: GeminiClient;
}

export function createNutritionModule(deps: CreateNutritionModuleOptions): NutritionModule {
  const foodRepo = new PgFoodRepository(deps.db);
  const mealRepo = new PgMealRepository(deps.db);
  const waterRepo = new PgWaterRepository(deps.db);
  const favoriteRepo = new PgFavoriteRepository(deps.db);
  const targetAdapter = new PgUserProfileTargetAdapter(deps.db);
  const auditLogger = new PgNutritionAuditLogger(deps.db);

  const mealPhotoService = deps.geminiClient ? new GeminiMealPhotoService(deps.geminiClient) : undefined;
  const analyzeMealPhotoUseCase = mealPhotoService ? new AnalyzeMealPhotoUseCase(mealPhotoService) : undefined;
  const voiceMealService = deps.geminiClient ? new GeminiVoiceMealService(deps.geminiClient) : undefined;
  const parseVoiceMealUseCase = voiceMealService ? new ParseVoiceMealUseCase(voiceMealService) : undefined;

  const memberController = createNutritionMemberController({
    getDailyNutrition: new GetDailyNutritionUseCase(mealRepo, waterRepo, targetAdapter),
    searchFoods: new SearchFoodsUseCase(foodRepo, favoriteRepo),
    getRecentFoods: new GetRecentFoodsUseCase(foodRepo, favoriteRepo),
    getFoodDetails: new GetFoodDetailsUseCase(foodRepo, favoriteRepo),
    createCustomFood: new CreateCustomFoodUseCase(foodRepo),
    logMeal: new LogMealUseCase(mealRepo, foodRepo, deps.uow),
    updateMeal: new UpdateMealUseCase(mealRepo, foodRepo, deps.uow),
    getMeal: new GetMealUseCase(mealRepo),
    logWater: new LogWaterUseCase(waterRepo),
    getNutritionAnalytics: new GetNutritionAnalyticsUseCase(mealRepo, targetAdapter),
    manageFoodFavorites: new ManageFoodFavoritesUseCase(favoriteRepo, foodRepo),
    analyzeMealPhoto: analyzeMealPhotoUseCase,
    parseVoiceMeal: parseVoiceMealUseCase,
  });

  const memberBasePath = deps.memberBasePath ?? deps.basePath ?? '/api/v1/nutrition';
  const memberRoutes = createNutritionMemberRoutes(memberBasePath, memberController);

  let adminRoutes: RouteGroup | undefined;
  if (deps.adminBasePath) {
    const adminController = createNutritionAdminController({
      manageFood: new AdminManageFoodUseCase(foodRepo, auditLogger),
      getStats: new AdminGetNutritionStatsUseCase(foodRepo),
    });
    adminRoutes = createNutritionAdminRoutes(deps.adminBasePath, adminController);
  }

  return {
    memberRoutes,
    adminRoutes,
    foodRepo,
    mealRepo,
    waterRepo,
    favoriteRepo,
    targetAdapter,
    auditLogger,
  };
}
