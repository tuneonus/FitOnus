import { z } from 'zod';
import { defineRoute, type RouteGroup } from '../../../shared/http/route.js';
import type { NutritionAdminController } from './admin-nutrition.controller.js';
import {
  adminCreateFoodRequest,
  adminDeleteFoodRequest,
  adminFoodViewSchema,
  adminGetFoodDetailsRequest,
  adminListFoodsRequest,
  adminUpdateFoodRequest,
  adminVerifyFoodRequest,
  nutritionCatalogStatsSchema,
} from './admin-nutrition.schemas.js';

const tags = ['Admin Nutrition'];

export function createNutritionAdminRoutes(
  basePath: string,
  controller: NutritionAdminController,
): RouteGroup {
  return {
    basePath,
    routes: [
      // 0. Catalog Statistics
      defineRoute({
        method: 'get',
        path: '/stats',
        summary: 'Admin Nutrition Statistics',
        description: 'Aggregate platform nutrition metrics, catalog counts, meals logged, and water intake.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        response: {
          status: 200,
          description: 'Catalog statistics',
          message: 'Nutrition catalog statistics retrieved successfully',
          schema: nutritionCatalogStatsSchema,
        },
        errorStatuses: [401, 403],
        handler: controller.getStats,
      }),

      // 1. List Food Catalog
      defineRoute({
        method: 'get',
        path: '/foods',
        summary: 'Admin List Foods',
        description:
          'Browse nutrition food catalog with filters by data source, verification status, custom status, and query.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: adminListFoodsRequest,
        response: {
          status: 200,
          description: 'Foods catalog list',
          message: 'Foods retrieved successfully',
          schema: z.array(adminFoodViewSchema),
          paginated: true,
        },
        errorStatuses: [400, 401, 403],
        handler: controller.listFoods,
      }),

      // 2. Create System Food
      defineRoute({
        method: 'post',
        path: '/foods',
        summary: 'Admin Create Verified Food',
        description: 'Add a new verified food item to the system nutrition catalog.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: adminCreateFoodRequest,
        response: {
          status: 201,
          description: 'Food created',
          message: 'Food created successfully',
          schema: adminFoodViewSchema,
        },
        errorStatuses: [400, 401, 403, 409],
        handler: controller.createFood,
      }),

      // 3. Get Food Details
      defineRoute({
        method: 'get',
        path: '/foods/:id',
        summary: 'Admin Get Food Details',
        description: 'Retrieve full food details by ID including source metadata and verification status.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: adminGetFoodDetailsRequest,
        response: {
          status: 200,
          description: 'Food details',
          message: 'Food details retrieved successfully',
          schema: adminFoodViewSchema,
        },
        errorStatuses: [400, 401, 403, 404],
        handler: controller.getFoodDetails,
      }),

      // 4. Update Verified Food
      defineRoute({
        method: 'put',
        path: '/foods/:id',
        summary: 'Admin Update Food',
        description: 'Update metadata, serving parameters, or macronutrients of a food catalog item.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: adminUpdateFoodRequest,
        response: {
          status: 200,
          description: 'Food updated',
          message: 'Food updated successfully',
          schema: adminFoodViewSchema,
        },
        errorStatuses: [400, 401, 403, 404, 409],
        handler: controller.updateFood,
      }),

      // 5. Delete System Food
      defineRoute({
        method: 'delete',
        path: '/foods/:id',
        summary: 'Admin Delete Food',
        description: 'Soft-delete a food item from the catalog while preserving historical meal snapshots.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: adminDeleteFoodRequest,
        response: {
          status: 204,
          description: 'Food deleted',
          message: 'Food deleted successfully',
          schema: z.object({ success: z.boolean() }),
        },
        errorStatuses: [400, 401, 403, 404],
        handler: controller.deleteFood,
      }),

      // 6. Food Verification Management
      defineRoute({
        method: 'post',
        path: '/foods/:id/verify',
        summary: 'Admin Verify Food',
        description: 'Update the verification status and source metadata of a food item.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: adminVerifyFoodRequest,
        response: {
          status: 200,
          description: 'Food verification updated',
          message: 'Food verification updated successfully',
          schema: adminFoodViewSchema,
        },
        errorStatuses: [400, 401, 403, 404],
        handler: controller.verifyFood,
      }),
    ],
  };
}
