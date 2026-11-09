import type { Request } from 'express';
import { requireActor } from '../../../middleware/authenticate.js';
import { getValidated } from '../../../middleware/validate.js';
import type { RouteResult } from '../../../shared/http/route.js';
import type { CreateCustomFoodUseCase } from '../application/use-cases/create-custom-food.js';
import type { GetDailyNutritionUseCase } from '../application/use-cases/get-daily-nutrition.js';
import type { GetFoodDetailsUseCase } from '../application/use-cases/get-food-details.js';
import type { GetMealUseCase } from '../application/use-cases/get-meal.js';
import type { GetNutritionAnalyticsUseCase } from '../application/use-cases/get-nutrition-analytics.js';
import type { GetRecentFoodsUseCase } from '../application/use-cases/get-recent-foods.js';
import type { LogMealUseCase } from '../application/use-cases/log-meal.js';
import type { LogWaterUseCase } from '../application/use-cases/log-water.js';
import type { ManageFoodFavoritesUseCase } from '../application/use-cases/manage-food-favorites.js';
import type { SearchFoodsUseCase } from '../application/use-cases/search-foods.js';
import type { UpdateMealUseCase } from '../application/use-cases/update-meal.js';
import type { AnalyzeMealPhotoUseCase } from '../application/use-cases/analyze-meal-photo.js';
import type { ParseVoiceMealUseCase } from '../application/use-cases/parse-voice-meal.js';
import type { MealPhotoAnalysisResult } from '../domain/meal-photo.types.js';
import type { VoiceMealParseResult } from '../domain/voice-meal.types.js';
import { analyzeMealPhotoRequest } from './meal-photo.schemas.js';
import { parseVoiceMealRequest } from './voice-meal.schemas.js';
import { AppError } from '../../../shared/errors/app-error.js';
import type {
  DailyNutritionView,
  FoodView,
  MealView,
  NutritionAnalyticsView,
  WaterIntakeView,
} from '../application/nutrition-view.js';
import {
  addFavoriteRequest,
  createCustomFoodRequest,
  getDailyNutritionRequest,
  getFoodByBarcodeRequest,
  getFoodDetailsRequest,
  getMealRequest,
  getNutritionAnalyticsRequest,
  getRecentFoodsRequest,
  listFavoritesRequest,
  logMealRequest,
  logWaterRequest,
  removeFavoriteRequest,
  searchFoodsRequest,
  updateMealRequest,
} from './nutrition.schemas.js';

export interface NutritionMemberUseCases {
  getDailyNutrition: GetDailyNutritionUseCase;
  searchFoods: SearchFoodsUseCase;
  getRecentFoods: GetRecentFoodsUseCase;
  getFoodDetails: GetFoodDetailsUseCase;
  createCustomFood: CreateCustomFoodUseCase;
  logMeal: LogMealUseCase;
  updateMeal: UpdateMealUseCase;
  getMeal: GetMealUseCase;
  logWater: LogWaterUseCase;
  getNutritionAnalytics: GetNutritionAnalyticsUseCase;
  manageFoodFavorites: ManageFoodFavoritesUseCase;
  analyzeMealPhoto?: AnalyzeMealPhotoUseCase;
  parseVoiceMeal?: ParseVoiceMealUseCase;
}

export type NutritionMemberController = ReturnType<typeof createNutritionMemberController>;

export function createNutritionMemberController(useCases: NutritionMemberUseCases) {
  return {
    getDailyNutrition: async (req: Request): Promise<RouteResult<DailyNutritionView>> => {
      const actor = requireActor(req);
      const { query } = getValidated(req, getDailyNutritionRequest);
      const data = await useCases.getDailyNutrition.execute({
        userId: actor.userId,
        date: query.date,
      });
      return { data, message: 'Daily nutrition retrieved successfully' };
    },

    searchFoods: async (req: Request): Promise<RouteResult<FoodView[]>> => {
      const actor = requireActor(req);
      const { query } = getValidated(req, searchFoodsRequest);
      const res = await useCases.searchFoods.execute({
        userId: actor.userId,
        query: query.q,
        page: query.page,
        limit: query.limit,
        isVerifiedOnly: query.verifiedOnly,
      });
      return {
        data: res.foods,
        message: 'Foods retrieved successfully',
        meta: {
          page: res.page,
          limit: res.limit,
          total: res.total,
          totalPages: Math.ceil(res.total / res.limit),
        },
      };
    },

    getRecentFoods: async (req: Request): Promise<RouteResult<FoodView[]>> => {
      const actor = requireActor(req);
      const { query } = getValidated(req, getRecentFoodsRequest);
      const data = await useCases.getRecentFoods.execute({
        userId: actor.userId,
        limit: query.limit,
      });
      return { data, message: 'Recent foods retrieved successfully' };
    },

    getFoodDetails: async (req: Request): Promise<RouteResult<FoodView>> => {
      const actor = requireActor(req);
      const { params } = getValidated(req, getFoodDetailsRequest);
      const data = await useCases.getFoodDetails.execute({
        userId: actor.userId,
        id: params.id,
      });
      return { data, message: 'Food details retrieved successfully' };
    },

    getFoodByBarcode: async (req: Request): Promise<RouteResult<FoodView>> => {
      const actor = requireActor(req);
      const { params } = getValidated(req, getFoodByBarcodeRequest);
      const data = await useCases.getFoodDetails.execute({
        userId: actor.userId,
        barcode: params.code,
      });
      return { data, message: 'Food details retrieved successfully' };
    },

    createCustomFood: async (req: Request): Promise<RouteResult<FoodView>> => {
      const actor = requireActor(req);
      const { body } = getValidated(req, createCustomFoodRequest);
      const data = await useCases.createCustomFood.execute({
        userId: actor.userId,
        ...body,
      });
      return {
        data,
        status: 201,
        message: 'Custom food created successfully',
      };
    },

    logMeal: async (req: Request): Promise<RouteResult<MealView>> => {
      const actor = requireActor(req);
      const { body } = getValidated(req, logMealRequest);
      const result = await useCases.logMeal.execute({
        userId: actor.userId,
        id: body.id,
        mealType: body.mealType,
        date: body.date,
        notes: body.notes,
        items: body.items,
      });

      return {
        data: result.meal,
        status: result.created ? 201 : 200,
        headers: !result.created ? { 'Idempotent-Replayed': 'true' } : undefined,
        message: result.created ? 'Meal logged successfully' : 'Meal log already recorded',
      };
    },

    updateMeal: async (req: Request): Promise<RouteResult<MealView>> => {
      const actor = requireActor(req);
      const { params, body } = getValidated(req, updateMealRequest);
      const data = await useCases.updateMeal.execute({
        userId: actor.userId,
        id: params.id,
        mealType: body.mealType,
        date: body.date,
        notes: body.notes,
        items: body.items,
      });
      return { data, message: 'Meal updated successfully' };
    },

    getMeal: async (req: Request): Promise<RouteResult<MealView>> => {
      const actor = requireActor(req);
      const { params } = getValidated(req, getMealRequest);
      const data = await useCases.getMeal.execute(actor.userId, params.id);
      return { data, message: 'Meal retrieved successfully' };
    },

    logWater: async (req: Request): Promise<RouteResult<WaterIntakeView>> => {
      const actor = requireActor(req);
      const { body } = getValidated(req, logWaterRequest);
      const result = await useCases.logWater.execute({
        userId: actor.userId,
        id: body.id,
        date: body.date,
        amountMl: body.amountMl,
        loggedAt: body.loggedAt ? new Date(body.loggedAt) : undefined,
      });

      return {
        data: result.entry,
        status: result.created ? 201 : 200,
        headers: !result.created ? { 'Idempotent-Replayed': 'true' } : undefined,
        message: result.created ? 'Water intake logged successfully' : 'Water intake already recorded',
      };
    },

    getNutritionAnalytics: async (req: Request): Promise<RouteResult<NutritionAnalyticsView>> => {
      const actor = requireActor(req);
      const { query } = getValidated(req, getNutritionAnalyticsRequest);
      const data = await useCases.getNutritionAnalytics.execute({
        userId: actor.userId,
        range: query.range,
        endDate: query.endDate,
      });
      return { data, message: 'Nutrition analytics retrieved successfully' };
    },

    listFavorites: async (req: Request): Promise<RouteResult<FoodView[]>> => {
      const actor = requireActor(req);
      const { query } = getValidated(req, listFavoritesRequest);
      const res = await useCases.manageFoodFavorites.listFavorites(actor.userId, query.page, query.limit);
      return {
        data: res.foods,
        message: 'Favorite foods retrieved successfully',
        meta: {
          page: res.page,
          limit: res.limit,
          total: res.total,
          totalPages: Math.ceil(res.total / res.limit),
        },
      };
    },

    addFavorite: async (req: Request): Promise<RouteResult<{ foodId: string; isFavorite: boolean }>> => {
      const actor = requireActor(req);
      const { body } = getValidated(req, addFavoriteRequest);
      await useCases.manageFoodFavorites.addFavorite(actor.userId, body.foodId);
      return {
        data: { foodId: body.foodId, isFavorite: true },
        status: 201,
        message: 'Food added to favorites',
      };
    },

    removeFavorite: async (req: Request): Promise<RouteResult<{ success: boolean }>> => {
      const actor = requireActor(req);
      const { params } = getValidated(req, removeFavoriteRequest);
      await useCases.manageFoodFavorites.removeFavorite(actor.userId, params.foodId);
      return {
        data: { success: true },
        message: 'Food removed from favorites',
      };
    },

    analyzeMealPhoto: async (req: Request): Promise<RouteResult<MealPhotoAnalysisResult>> => {
      const actor = requireActor(req);
      const { body } = getValidated(req, analyzeMealPhotoRequest);
      if (!useCases.analyzeMealPhoto) {
        throw new AppError('unavailable', 'SERVICE_UNAVAILABLE', 'Meal photo analysis service is not available.');
      }
      const data = await useCases.analyzeMealPhoto.execute({
        userId: actor.userId,
        imageBase64: body.image,
        mimeType: body.mimeType,
        mealType: body.mealType,
        notes: body.notes,
      });
      return {
        status: 200,
        data,
        message: 'Meal photo analyzed successfully',
      };
    },

    parseVoiceMeal: async (req: Request): Promise<RouteResult<VoiceMealParseResult>> => {
      const actor = requireActor(req);
      const { body } = getValidated(req, parseVoiceMealRequest);
      if (!useCases.parseVoiceMeal) {
        throw new AppError('unavailable', 'SERVICE_UNAVAILABLE', 'Voice meal parsing service is not available.');
      }
      const data = await useCases.parseVoiceMeal.execute({
        userId: actor.userId,
        transcript: body.transcript,
        audioBase64: body.audio,
        mimeType: body.mimeType,
        lang: body.lang,
        mealType: body.mealType,
      });
      return {
        status: 200,
        data,
        message: 'Voice meal parsed successfully',
      };
    },
  };
}
