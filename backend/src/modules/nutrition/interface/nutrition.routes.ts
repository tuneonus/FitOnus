import { z } from 'zod';
import { defineRoute, type RouteGroup } from '../../../shared/http/route.js';
import type { NutritionMemberController } from './nutrition.controller.js';
import {
  addFavoriteRequest,
  createCustomFoodRequest,
  dailyNutritionViewSchema,
  deleteFavoriteResultSchema,
  favoriteResultSchema,
  foodViewSchema,
  getDailyNutritionRequest,
  getFoodByBarcodeRequest,
  getFoodDetailsRequest,
  getMealRequest,
  getNutritionAnalyticsRequest,
  getRecentFoodsRequest,
  listFavoritesRequest,
  logMealRequest,
  logWaterRequest,
  mealViewSchema,
  nutritionAnalyticsViewSchema,
  removeFavoriteRequest,
  searchFoodsRequest,
  updateMealRequest,
  waterIntakeViewSchema,
} from './nutrition.schemas.js';

const tags = ['Nutrition'];

export function createNutritionMemberRoutes(
  basePath: string,
  controller: NutritionMemberController,
): RouteGroup {
  return {
    basePath,
    routes: [
      // 1. Daily Nutrition Dashboard
      defineRoute({
        method: 'get',
        path: '/daily',
        summary: 'Get daily nutrition summary and progress against targets',
        description:
          'Aggregates consumed calories, protein, carbs, fat, fiber, and water intake vs configured user targets.',
        tags,
        access: { kind: 'authenticated' },
        request: getDailyNutritionRequest,
        response: {
          status: 200,
          description: 'Daily nutrition summary',
          message: 'Daily nutrition retrieved successfully',
          schema: dailyNutritionViewSchema,
        },
        handler: controller.getDailyNutrition,
      }),

      // 2. Search Foods Catalog
      defineRoute({
        method: 'get',
        path: '/foods/search',
        summary: 'Search foods catalog and custom foods',
        description:
          'Full-text and trigram search across USDA verified foods and requesting user custom foods.',
        tags,
        access: { kind: 'authenticated' },
        request: searchFoodsRequest,
        response: {
          status: 200,
          description: 'Foods catalog',
          message: 'Foods retrieved successfully',
          schema: z.array(foodViewSchema),
          paginated: true,
        },
        handler: controller.searchFoods,
      }),

      // 3. Recent Foods
      defineRoute({
        method: 'get',
        path: '/foods/recent',
        summary: 'List recently logged foods',
        description: 'Returns unique recently logged foods by the authenticated user.',
        tags,
        access: { kind: 'authenticated' },
        request: getRecentFoodsRequest,
        response: {
          status: 200,
          description: 'Recent foods',
          message: 'Recent foods retrieved successfully',
          schema: z.array(foodViewSchema),
        },
        handler: controller.getRecentFoods,
      }),

      // 4. Barcode Lookup (Must precede :id)
      defineRoute({
        method: 'get',
        path: '/foods/barcode/:code',
        summary: 'Lookup food by barcode',
        description: 'Exact barcode lookup matching verified foods or user custom foods.',
        tags,
        access: { kind: 'authenticated' },
        request: getFoodByBarcodeRequest,
        response: {
          status: 200,
          description: 'Food details',
          message: 'Food details retrieved successfully',
          schema: foodViewSchema,
        },
        errorStatuses: [404],
        handler: controller.getFoodByBarcode,
      }),

      // 5. Food Details by ID
      defineRoute({
        method: 'get',
        path: '/foods/:id',
        summary: 'Get food details by ID',
        description: 'Retrieve detailed macronutrient and serving metadata for a food item.',
        tags,
        access: { kind: 'authenticated' },
        request: getFoodDetailsRequest,
        response: {
          status: 200,
          description: 'Food details',
          message: 'Food details retrieved successfully',
          schema: foodViewSchema,
        },
        errorStatuses: [403, 404],
        handler: controller.getFoodDetails,
      }),

      // 6. Create Custom Food
      defineRoute({
        method: 'post',
        path: '/foods',
        summary: 'Create custom food item',
        description: 'Create a private, user-owned custom food with specified serving basis and macros.',
        tags,
        access: { kind: 'authenticated' },
        request: createCustomFoodRequest,
        response: {
          status: 201,
          description: 'Custom food created',
          message: 'Custom food created successfully',
          schema: foodViewSchema,
        },
        errorStatuses: [400, 409],
        handler: controller.createCustomFood,
      }),

      // 7. Log Meal
      defineRoute({
        method: 'post',
        path: '/meals',
        summary: 'Log meal entry (idempotent)',
        description:
          'Persist a meal with atomic item snapshots. Server recalculates portions from authoritative records.',
        tags,
        access: { kind: 'authenticated' },
        request: logMealRequest,
        response: {
          status: 201,
          description: 'Meal logged',
          message: 'Meal logged successfully',
          schema: mealViewSchema,
        },
        errorStatuses: [400, 403, 404, 409],
        handler: controller.logMeal,
      }),

      // 8. Update Meal
      defineRoute({
        method: 'put',
        path: '/meals/:id',
        summary: 'Update existing meal entry',
        description: 'Atomically replace items and notes for an existing meal owned by the user.',
        tags,
        access: { kind: 'authenticated' },
        request: updateMealRequest,
        response: {
          status: 200,
          description: 'Updated meal',
          message: 'Meal updated successfully',
          schema: mealViewSchema,
        },
        errorStatuses: [400, 403, 404],
        handler: controller.updateMeal,
      }),

      // 9. Get Meal Details
      defineRoute({
        method: 'get',
        path: '/meals/:id',
        summary: 'Get meal entry by ID',
        description: 'Retrieve frozen historical nutrition snapshots for a logged meal.',
        tags,
        access: { kind: 'authenticated' },
        request: getMealRequest,
        response: {
          status: 200,
          description: 'Meal details',
          message: 'Meal retrieved successfully',
          schema: mealViewSchema,
        },
        errorStatuses: [403, 404],
        handler: controller.getMeal,
      }),

      // 10. Log Water Intake
      defineRoute({
        method: 'post',
        path: '/water',
        summary: 'Log hydration intake (idempotent)',
        description: 'Record water intake amount in milliliters with client UUID idempotency.',
        tags,
        access: { kind: 'authenticated' },
        request: logWaterRequest,
        response: {
          status: 201,
          description: 'Water intake recorded',
          message: 'Water intake logged successfully',
          schema: waterIntakeViewSchema,
        },
        errorStatuses: [400, 409],
        handler: controller.logWater,
      }),

      // 11. Nutrition Analytics
      defineRoute({
        method: 'get',
        path: '/analytics',
        summary: 'Get nutrition analytics and trends',
        description:
          'Calculates weekly or monthly macro splits, daily trend points, and top logged foods from real logs.',
        tags,
        access: { kind: 'authenticated' },
        request: getNutritionAnalyticsRequest,
        response: {
          status: 200,
          description: 'Nutrition analytics',
          message: 'Nutrition analytics retrieved successfully',
          schema: nutritionAnalyticsViewSchema,
        },
        handler: controller.getNutritionAnalytics,
      }),

      // 12. List Food Favorites
      defineRoute({
        method: 'get',
        path: '/favorites',
        summary: 'List favorite foods',
        description: 'List user favorited foods with pagination.',
        tags,
        access: { kind: 'authenticated' },
        request: listFavoritesRequest,
        response: {
          status: 200,
          description: 'Favorite foods',
          message: 'Favorite foods retrieved successfully',
          schema: z.array(foodViewSchema),
          paginated: true,
        },
        handler: controller.listFavorites,
      }),

      // 13. Add Food to Favorites
      defineRoute({
        method: 'post',
        path: '/favorites',
        summary: 'Add food to favorites',
        description: 'Bookmark a catalog or custom food as favorite.',
        tags,
        access: { kind: 'authenticated' },
        request: addFavoriteRequest,
        response: {
          status: 201,
          description: 'Food favorited',
          message: 'Food added to favorites',
          schema: favoriteResultSchema,
        },
        errorStatuses: [403, 404],
        handler: controller.addFavorite,
      }),

      // 14. Remove Food from Favorites
      defineRoute({
        method: 'delete',
        path: '/favorites/:foodId',
        summary: 'Remove food from favorites',
        description: 'Remove a bookmarked food from user favorites.',
        tags,
        access: { kind: 'authenticated' },
        request: removeFavoriteRequest,
        response: {
          status: 200,
          description: 'Food removed from favorites',
          message: 'Food removed from favorites',
          schema: deleteFavoriteResultSchema,
        },
        handler: controller.removeFavorite,
      }),
    ],
  };
}

