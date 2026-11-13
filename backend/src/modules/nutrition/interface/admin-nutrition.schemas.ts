import { z } from 'zod';
import {
  FOOD_BARCODE_MAX_LENGTH,
  FOOD_BRAND_MAX_LENGTH,
  FOOD_LIMITS,
  FOOD_NAME_MAX_LENGTH,
  SERVING_UNIT_MAX_LENGTH,
} from '../domain/nutrition-limits.js';
import { boundedNumber, foodViewSchema } from './nutrition.schemas.js';

export const adminFoodViewSchema = foodViewSchema.extend({
  dataSource: z.enum(['usda_fdc', 'open_food_facts', 'manufacturer_label', 'user_custom']),
  sourceId: z.string().nullable(),
  verificationStatus: z.enum(['verified', 'unverified', 'rejected']),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

export const nutritionCatalogStatsSchema = z.object({
  totalVerifiedFoods: z.number().int().nonnegative(),
  totalCustomFoods: z.number().int().nonnegative(),
  totalMealsLogged: z.number().int().nonnegative(),
  totalMealItemsLogged: z.number().int().nonnegative(),
  totalWaterLogs: z.number().int().nonnegative(),
  verifiedFoodsBySource: z.record(z.string(), z.number().int().nonnegative()),
});

const booleanQueryParam = z.preprocess((val) => {
  if (typeof val === 'string') {
    if (val.toLowerCase() === 'true') return true;
    if (val.toLowerCase() === 'false') return false;
  }
  return val;
}, z.boolean().optional());

export const adminListFoodsRequest = {
  query: z.object({
    q: z.string().trim().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    dataSource: z.enum(['usda_fdc', 'open_food_facts', 'manufacturer_label', 'user_custom']).optional(),
    verificationStatus: z.enum(['verified', 'unverified', 'rejected']).optional(),
    isCustom: booleanQueryParam,
    includeDeleted: booleanQueryParam.transform((v) => v ?? false),
  }),
};

export const adminGetFoodDetailsRequest = {
  params: z.object({
    id: z.string().uuid(),
  }),
  query: z.object({
    includeDeleted: booleanQueryParam.transform((v) => v ?? false),
  }),
};

export const adminCreateFoodRequest = {
  body: z.object({
    name: z.string().trim().min(1).max(FOOD_NAME_MAX_LENGTH),
    brand: z.string().trim().max(FOOD_BRAND_MAX_LENGTH).nullable().optional(),
    barcode: z.string().trim().max(FOOD_BARCODE_MAX_LENGTH).nullable().optional(),
    servingSize: boundedNumber(FOOD_LIMITS.servingSize),
    servingUnit: z.string().trim().min(1).max(SERVING_UNIT_MAX_LENGTH),
    servingWeightG: boundedNumber(FOOD_LIMITS.servingWeightG),
    servingVolumeMl: boundedNumber(FOOD_LIMITS.servingVolumeMl).nullable().optional(),
    densityGPerMl: boundedNumber(FOOD_LIMITS.densityGPerMl).nullable().optional(),
    servingBasis: z.enum(['100g', 'serving', '100ml']).default('100g'),
    calories: boundedNumber(FOOD_LIMITS.calories),
    proteinG: boundedNumber(FOOD_LIMITS.macroG),
    carbohydratesG: boundedNumber(FOOD_LIMITS.macroG),
    fatG: boundedNumber(FOOD_LIMITS.macroG),
    fiberG: boundedNumber(FOOD_LIMITS.macroG).optional(),
    sugarG: boundedNumber(FOOD_LIMITS.macroG).nullable().optional(),
    sodiumMg: boundedNumber(FOOD_LIMITS.sodiumMg).nullable().optional(),
    cholesterolMg: boundedNumber(FOOD_LIMITS.cholesterolMg).nullable().optional(),
    dataSource: z.enum(['usda_fdc', 'open_food_facts', 'manufacturer_label']),
    sourceId: z.string().trim().max(100).nullable().optional(),
  }),
};

export const adminUpdateFoodRequest = {
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    name: z.string().trim().min(1).max(FOOD_NAME_MAX_LENGTH).optional(),
    brand: z.string().trim().max(FOOD_BRAND_MAX_LENGTH).nullable().optional(),
    barcode: z.string().trim().max(FOOD_BARCODE_MAX_LENGTH).nullable().optional(),
    servingSize: boundedNumber(FOOD_LIMITS.servingSize).optional(),
    servingUnit: z.string().trim().min(1).max(SERVING_UNIT_MAX_LENGTH).optional(),
    servingWeightG: boundedNumber(FOOD_LIMITS.servingWeightG).optional(),
    servingVolumeMl: boundedNumber(FOOD_LIMITS.servingVolumeMl).nullable().optional(),
    densityGPerMl: boundedNumber(FOOD_LIMITS.densityGPerMl).nullable().optional(),
    servingBasis: z.enum(['100g', 'serving', '100ml']).optional(),
    calories: boundedNumber(FOOD_LIMITS.calories).optional(),
    proteinG: boundedNumber(FOOD_LIMITS.macroG).optional(),
    carbohydratesG: boundedNumber(FOOD_LIMITS.macroG).optional(),
    fatG: boundedNumber(FOOD_LIMITS.macroG).optional(),
    fiberG: boundedNumber(FOOD_LIMITS.macroG).optional(),
    sugarG: boundedNumber(FOOD_LIMITS.macroG).nullable().optional(),
    sodiumMg: boundedNumber(FOOD_LIMITS.sodiumMg).nullable().optional(),
    cholesterolMg: boundedNumber(FOOD_LIMITS.cholesterolMg).nullable().optional(),
    dataSource: z.enum(['usda_fdc', 'open_food_facts', 'manufacturer_label']).optional(),
    sourceId: z.string().trim().max(100).nullable().optional(),
    isVerified: z.boolean().optional(),
    verificationStatus: z.enum(['verified', 'unverified', 'rejected']).optional(),
  }),
};

export const adminDeleteFoodRequest = {
  params: z.object({
    id: z.string().uuid(),
  }),
};

export const adminVerifyFoodRequest = {
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    verificationStatus: z.enum(['verified', 'unverified', 'rejected']),
    dataSource: z.enum(['usda_fdc', 'open_food_facts', 'manufacturer_label']).optional(),
    sourceId: z.string().trim().max(100).nullable().optional(),
  }),
};
