import { z } from 'zod';
import { foodViewSchema } from './nutrition.schemas.js';

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
    name: z.string().trim().min(1).max(150),
    brand: z.string().trim().max(100).nullable().optional(),
    barcode: z.string().trim().max(64).nullable().optional(),
    servingSize: z.number().positive(),
    servingUnit: z.string().trim().min(1).max(30),
    servingWeightG: z.number().positive(),
    servingVolumeMl: z.number().positive().nullable().optional(),
    densityGPerMl: z.number().positive().nullable().optional(),
    servingBasis: z.enum(['100g', 'serving', '100ml']).default('100g'),
    calories: z.number().nonnegative(),
    proteinG: z.number().nonnegative(),
    carbohydratesG: z.number().nonnegative(),
    fatG: z.number().nonnegative(),
    fiberG: z.number().nonnegative().optional(),
    sugarG: z.number().nonnegative().nullable().optional(),
    sodiumMg: z.number().nonnegative().nullable().optional(),
    cholesterolMg: z.number().nonnegative().nullable().optional(),
    dataSource: z.enum(['usda_fdc', 'open_food_facts', 'manufacturer_label']),
    sourceId: z.string().trim().max(100).nullable().optional(),
  }),
};

export const adminUpdateFoodRequest = {
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    name: z.string().trim().min(1).max(150).optional(),
    brand: z.string().trim().max(100).nullable().optional(),
    barcode: z.string().trim().max(64).nullable().optional(),
    servingSize: z.number().positive().optional(),
    servingUnit: z.string().trim().min(1).max(30).optional(),
    servingWeightG: z.number().positive().optional(),
    servingVolumeMl: z.number().positive().nullable().optional(),
    densityGPerMl: z.number().positive().nullable().optional(),
    servingBasis: z.enum(['100g', 'serving', '100ml']).optional(),
    calories: z.number().nonnegative().optional(),
    proteinG: z.number().nonnegative().optional(),
    carbohydratesG: z.number().nonnegative().optional(),
    fatG: z.number().nonnegative().optional(),
    fiberG: z.number().nonnegative().optional(),
    sugarG: z.number().nonnegative().nullable().optional(),
    sodiumMg: z.number().nonnegative().nullable().optional(),
    cholesterolMg: z.number().nonnegative().nullable().optional(),
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
