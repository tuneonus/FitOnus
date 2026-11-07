import type { Request } from 'express';
import { requireActor } from '../../../middleware/authenticate.js';
import { getValidated } from '../../../middleware/validate.js';
import type { RouteResult } from '../../../shared/http/route.js';
import type { AdminGetNutritionStatsUseCase } from '../application/use-cases/admin-get-nutrition-stats.js';
import type { AdminManageFoodUseCase } from '../application/use-cases/admin-manage-food.js';
import type { AdminFoodView } from '../application/nutrition-view.js';
import type { NutritionCatalogStats } from '../application/ports.js';
import {
  adminCreateFoodRequest,
  adminDeleteFoodRequest,
  adminGetFoodDetailsRequest,
  adminListFoodsRequest,
  adminUpdateFoodRequest,
  adminVerifyFoodRequest,
} from './admin-nutrition.schemas.js';

export interface AdminNutritionUseCases {
  manageFood: AdminManageFoodUseCase;
  getStats: AdminGetNutritionStatsUseCase;
}

export type NutritionAdminController = ReturnType<typeof createNutritionAdminController>;

export function createNutritionAdminController(useCases: AdminNutritionUseCases) {
  return {
    listFoods: async (req: Request): Promise<RouteResult<AdminFoodView[]>> => {
      const { query } = getValidated(req, adminListFoodsRequest);
      const result = await useCases.manageFood.list({
        query: query.q,
        page: query.page,
        limit: query.limit,
        dataSource: query.dataSource,
        verificationStatus: query.verificationStatus,
        isCustom: query.isCustom,
        includeDeleted: query.includeDeleted,
      });

      return {
        data: result.foods,
        status: 200,
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
        message: 'Foods retrieved successfully',
      };
    },

    getFoodDetails: async (req: Request): Promise<RouteResult<AdminFoodView>> => {
      const { params, query } = getValidated(req, adminGetFoodDetailsRequest);
      const data = await useCases.manageFood.getDetails(params.id, query.includeDeleted);
      return {
        data,
        status: 200,
        message: 'Food details retrieved successfully',
      };
    },

    createFood: async (req: Request): Promise<RouteResult<AdminFoodView>> => {
      const actor = requireActor(req);
      const { body } = getValidated(req, adminCreateFoodRequest);
      const data = await useCases.manageFood.create({
        adminId: actor.userId,
        ...body,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
      return {
        data,
        status: 201,
        message: 'Food created successfully',
      };
    },

    updateFood: async (req: Request): Promise<RouteResult<AdminFoodView>> => {
      const actor = requireActor(req);
      const { params, body } = getValidated(req, adminUpdateFoodRequest);
      const data = await useCases.manageFood.update({
        adminId: actor.userId,
        foodId: params.id,
        ...body,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
      return {
        data,
        status: 200,
        message: 'Food updated successfully',
      };
    },

    deleteFood: async (req: Request): Promise<RouteResult<{ success: boolean }>> => {
      const actor = requireActor(req);
      const { params } = getValidated(req, adminDeleteFoodRequest);
      await useCases.manageFood.delete(actor.userId, params.id, req.ip, req.get('user-agent'));
      return {
        data: { success: true },
        status: 204,
        message: 'Food deleted successfully',
      };
    },

    verifyFood: async (req: Request): Promise<RouteResult<AdminFoodView>> => {
      const actor = requireActor(req);
      const { params, body } = getValidated(req, adminVerifyFoodRequest);
      const data = await useCases.manageFood.verifyFood({
        adminId: actor.userId,
        foodId: params.id,
        ...body,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
      return {
        data,
        status: 200,
        message: 'Food verification updated successfully',
      };
    },

    getStats: async (_req: Request): Promise<RouteResult<NutritionCatalogStats>> => {
      const data = await useCases.getStats.execute();
      return {
        data,
        status: 200,
        message: 'Nutrition catalog statistics retrieved successfully',
      };
    },
  };
}
