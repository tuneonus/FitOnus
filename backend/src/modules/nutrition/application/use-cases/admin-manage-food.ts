import crypto from 'node:crypto';
import { AppError } from '../../../../shared/errors/app-error.js';
import type { FoodDataSource, FoodProps, VerificationStatus } from '../../domain/food.js';
import { Food } from '../../domain/food.js';
import {
  FOOD_BARCODE_MAX_LENGTH,
  FOOD_BRAND_MAX_LENGTH,
  FOOD_NAME_MAX_LENGTH,
  SERVING_UNIT_MAX_LENGTH,
  assertFoodWithinLimits,
  assertMaxLength,
} from '../../domain/nutrition-limits.js';
import type { IFoodRepository, INutritionAuditLogger } from '../ports.js';
import { toAdminFoodView, type AdminFoodView } from '../nutrition-view.js';

export interface AdminListFoodsInput {
  query?: string;
  page?: number;
  limit?: number;
  dataSource?: FoodDataSource;
  verificationStatus?: VerificationStatus;
  isCustom?: boolean;
  includeDeleted?: boolean;
}

export interface AdminListFoodsResult {
  foods: AdminFoodView[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminCreateFoodInput {
  adminId: string;
  name: string;
  brand?: string | null;
  barcode?: string | null;
  servingSize: number;
  servingUnit: string;
  servingWeightG: number;
  servingVolumeMl?: number | null;
  densityGPerMl?: number | null;
  servingBasis?: '100g' | 'serving' | '100ml';
  calories: number;
  proteinG: number;
  carbohydratesG: number;
  fatG: number;
  fiberG?: number;
  sugarG?: number | null;
  sodiumMg?: number | null;
  cholesterolMg?: number | null;
  dataSource: 'usda_fdc' | 'open_food_facts' | 'manufacturer_label';
  sourceId?: string | null;
  ipAddress?: string;
  userAgent?: string;
}

export interface AdminUpdateFoodInput {
  adminId: string;
  foodId: string;
  name?: string;
  brand?: string | null;
  barcode?: string | null;
  servingSize?: number;
  servingUnit?: string;
  servingWeightG?: number;
  servingVolumeMl?: number | null;
  densityGPerMl?: number | null;
  servingBasis?: '100g' | 'serving' | '100ml';
  calories?: number;
  proteinG?: number;
  carbohydratesG?: number;
  fatG?: number;
  fiberG?: number;
  sugarG?: number | null;
  sodiumMg?: number | null;
  cholesterolMg?: number | null;
  dataSource?: 'usda_fdc' | 'open_food_facts' | 'manufacturer_label';
  sourceId?: string | null;
  isVerified?: boolean;
  verificationStatus?: VerificationStatus;
  ipAddress?: string;
  userAgent?: string;
}

export interface AdminVerifyFoodInput {
  adminId: string;
  foodId: string;
  verificationStatus: VerificationStatus;
  dataSource?: 'usda_fdc' | 'open_food_facts' | 'manufacturer_label';
  sourceId?: string | null;
  ipAddress?: string;
  userAgent?: string;
}

export function validateServingDensityConsistency(
  servingWeightG: number,
  servingVolumeMl?: number | null,
  densityGPerMl?: number | null,
): void {
  if (
    servingVolumeMl !== undefined &&
    servingVolumeMl !== null &&
    densityGPerMl !== undefined &&
    densityGPerMl !== null
  ) {
    const expectedWeight = servingVolumeMl * densityGPerMl;
    const diff = Math.abs(servingWeightG - expectedWeight);
    const relativeDiff = diff / servingWeightG;
    if (relativeDiff > 0.15) {
      throw new AppError(
        'bad_request',
        'VALIDATION_FAILED',
        `Serving weight (${servingWeightG}g) is inconsistent with liquid volume (${servingVolumeMl}ml) and density (${densityGPerMl}g/ml). Expected ~${Math.round(expectedWeight)}g.`,
      );
    }
  }
}

export function validateMacroSanity(macros: {
  calories: number;
  proteinG: number;
  carbohydratesG: number;
  fatG: number;
  servingBasis: '100g' | 'serving' | '100ml';
}): void {
  if (macros.calories < 0 || macros.proteinG < 0 || macros.carbohydratesG < 0 || macros.fatG < 0) {
    throw new AppError('bad_request', 'VALIDATION_FAILED', 'Calories and macronutrients cannot be negative.');
  }

  if (macros.servingBasis === '100g') {
    const totalMacrosG = macros.proteinG + macros.carbohydratesG + macros.fatG;
    if (totalMacrosG > 105) {
      throw new AppError(
        'bad_request',
        'VALIDATION_FAILED',
        `Total macronutrients (${totalMacrosG.toFixed(1)}g) cannot exceed 100g on a 100g serving basis.`,
      );
    }
  }
}

export class AdminManageFoodUseCase {
  constructor(
    private readonly foodRepo: IFoodRepository,
    private readonly auditLogger: INutritionAuditLogger,
  ) {}

  async list(input: AdminListFoodsInput): Promise<AdminListFoodsResult> {
    const page = Math.max(1, input.page ?? 1);
    const limit = Math.min(100, Math.max(1, input.limit ?? 20));
    const offset = (page - 1) * limit;

    const { foods, total } = await this.foodRepo.search({
      query: input.query?.trim(),
      userId: null,
      offset,
      limit,
      isCustom: input.isCustom,
      dataSource: input.dataSource,
      verificationStatus: input.verificationStatus,
      includeDeleted: input.includeDeleted ?? false,
    });

    return {
      foods: foods.map(toAdminFoodView),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async getDetails(foodId: string, includeDeleted: boolean = false): Promise<AdminFoodView> {
    const food = await this.foodRepo.findById(foodId, undefined, includeDeleted);
    if (!food) {
      throw new AppError('not_found', 'NOT_FOUND', 'Food not found.');
    }
    return toAdminFoodView(food);
  }

  async create(input: AdminCreateFoodInput): Promise<AdminFoodView> {
    assertFoodWithinLimits(input);
    assertMaxLength('name', input.name.trim(), FOOD_NAME_MAX_LENGTH);
    assertMaxLength('brand', input.brand?.trim(), FOOD_BRAND_MAX_LENGTH);
    assertMaxLength('barcode', input.barcode?.trim(), FOOD_BARCODE_MAX_LENGTH);
    assertMaxLength('servingUnit', input.servingUnit.trim(), SERVING_UNIT_MAX_LENGTH);

    validateMacroSanity({
      calories: input.calories,
      proteinG: input.proteinG,
      carbohydratesG: input.carbohydratesG,
      fatG: input.fatG,
      servingBasis: input.servingBasis ?? '100g',
    });

    validateServingDensityConsistency(input.servingWeightG, input.servingVolumeMl, input.densityGPerMl);

    if (input.barcode) {
      const existingBarcode = await this.foodRepo.findByBarcode(input.barcode);
      if (existingBarcode && existingBarcode.isVerified) {
        throw new AppError(
          'conflict',
          'CONFLICT',
          'A verified food with this barcode already exists in the catalog.',
        );
      }
    }

    const now = new Date();
    const food = new Food({
      id: crypto.randomUUID(),
      name: input.name.trim(),
      brand: input.brand?.trim() || null,
      barcode: input.barcode?.trim() || null,
      servingSize: input.servingSize,
      servingUnit: input.servingUnit.trim(),
      servingWeightG: input.servingWeightG,
      servingVolumeMl: input.servingVolumeMl ?? null,
      densityGPerMl: input.densityGPerMl ?? null,
      servingBasis: input.servingBasis ?? '100g',
      calories: input.calories,
      proteinG: input.proteinG,
      carbohydratesG: input.carbohydratesG,
      fatG: input.fatG,
      fiberG: input.fiberG ?? 0,
      sugarG: input.sugarG ?? 0,
      sodiumMg: input.sodiumMg ?? 0,
      cholesterolMg: input.cholesterolMg ?? 0,
      dataSource: input.dataSource,
      sourceId: input.sourceId?.trim() || null,
      isCustom: false,
      isVerified: true,
      verificationStatus: 'verified',
      createdBy: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const created = await this.foodRepo.create(food);

    await this.auditLogger.logAction(
      input.adminId,
      'nutrition.food.create',
      { foodId: created.id, name: created.name, dataSource: created.dataSource },
      null,
      input.ipAddress,
      input.userAgent,
    );

    return toAdminFoodView(created);
  }

  async update(input: AdminUpdateFoodInput): Promise<AdminFoodView> {
    const existing = await this.foodRepo.findById(input.foodId, undefined, false);
    if (!existing) {
      throw new AppError('not_found', 'NOT_FOUND', 'Food not found.');
    }

    // Only the fields being changed are range-checked, so a catalog row that predates the limits stays editable.
    assertFoodWithinLimits(input);
    assertMaxLength('name', input.name?.trim(), FOOD_NAME_MAX_LENGTH);
    assertMaxLength('brand', input.brand?.trim(), FOOD_BRAND_MAX_LENGTH);
    assertMaxLength('barcode', input.barcode?.trim(), FOOD_BARCODE_MAX_LENGTH);
    assertMaxLength('servingUnit', input.servingUnit?.trim(), SERVING_UNIT_MAX_LENGTH);

    const servingWeightG = input.servingWeightG ?? existing.servingWeightG;
    const servingVolumeMl =
      input.servingVolumeMl !== undefined ? input.servingVolumeMl : existing.servingVolumeMl;
    const densityGPerMl = input.densityGPerMl !== undefined ? input.densityGPerMl : existing.densityGPerMl;

    validateServingDensityConsistency(servingWeightG, servingVolumeMl, densityGPerMl);

    validateMacroSanity({
      calories: input.calories ?? existing.calories,
      proteinG: input.proteinG ?? existing.proteinG,
      carbohydratesG: input.carbohydratesG ?? existing.carbohydratesG,
      fatG: input.fatG ?? existing.fatG,
      servingBasis: input.servingBasis ?? existing.servingBasis,
    });

    if (input.barcode && input.barcode !== existing.barcode) {
      const existingBarcode = await this.foodRepo.findByBarcode(input.barcode);
      if (existingBarcode && existingBarcode.id !== existing.id && existingBarcode.isVerified) {
        throw new AppError(
          'conflict',
          'CONFLICT',
          'A verified food with this barcode already exists in the catalog.',
        );
      }
    }

    const patch: Partial<FoodProps> = {};
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.brand !== undefined) patch.brand = input.brand?.trim() || null;
    if (input.barcode !== undefined) patch.barcode = input.barcode?.trim() || null;
    if (input.servingSize !== undefined) patch.servingSize = input.servingSize;
    if (input.servingUnit !== undefined) patch.servingUnit = input.servingUnit.trim();
    if (input.servingWeightG !== undefined) patch.servingWeightG = input.servingWeightG;
    if (input.servingVolumeMl !== undefined) patch.servingVolumeMl = input.servingVolumeMl;
    if (input.densityGPerMl !== undefined) patch.densityGPerMl = input.densityGPerMl;
    if (input.servingBasis !== undefined) patch.servingBasis = input.servingBasis;
    if (input.calories !== undefined) patch.calories = input.calories;
    if (input.proteinG !== undefined) patch.proteinG = input.proteinG;
    if (input.carbohydratesG !== undefined) patch.carbohydratesG = input.carbohydratesG;
    if (input.fatG !== undefined) patch.fatG = input.fatG;
    if (input.fiberG !== undefined) patch.fiberG = input.fiberG;
    if (input.sugarG !== undefined) patch.sugarG = input.sugarG ?? 0;
    if (input.sodiumMg !== undefined) patch.sodiumMg = input.sodiumMg ?? 0;
    if (input.cholesterolMg !== undefined) patch.cholesterolMg = input.cholesterolMg ?? 0;
    if (input.dataSource !== undefined) patch.dataSource = input.dataSource;
    if (input.sourceId !== undefined) patch.sourceId = input.sourceId?.trim() || null;
    if (input.isVerified !== undefined) {
      patch.isVerified = input.isVerified;
      if (input.isVerified) {
        patch.isCustom = false;
        patch.createdBy = null;
      } else if (!existing.createdBy) {
        patch.createdBy = input.adminId;
      }
    }
    if (input.verificationStatus !== undefined) {
      patch.verificationStatus = input.verificationStatus;
      if (input.verificationStatus === 'verified') {
        patch.isVerified = true;
        patch.isCustom = false;
        patch.createdBy = null;
      } else if (!existing.createdBy) {
        patch.createdBy = input.adminId;
      }
    }

    const updated = await this.foodRepo.update(input.foodId, patch, null);
    if (!updated) {
      throw new AppError('internal', 'INTERNAL_ERROR', 'Failed to update food.');
    }

    await this.auditLogger.logAction(
      input.adminId,
      'nutrition.food.update',
      { foodId: updated.id, name: updated.name },
      null,
      input.ipAddress,
      input.userAgent,
    );

    return toAdminFoodView(updated);
  }

  async delete(adminId: string, foodId: string, ipAddress?: string, userAgent?: string): Promise<void> {
    const existing = await this.foodRepo.findById(foodId, undefined, false);
    if (!existing) {
      throw new AppError('not_found', 'NOT_FOUND', 'Food not found.');
    }

    await this.foodRepo.softDelete(foodId);

    await this.auditLogger.logAction(
      adminId,
      'nutrition.food.delete',
      { foodId, name: existing.name },
      null,
      ipAddress,
      userAgent,
    );
  }

  async verifyFood(input: AdminVerifyFoodInput): Promise<AdminFoodView> {
    const existing = await this.foodRepo.findById(input.foodId, undefined, false);
    if (!existing) {
      throw new AppError('not_found', 'NOT_FOUND', 'Food not found.');
    }

    const patch: Partial<FoodProps> = {
      verificationStatus: input.verificationStatus,
    };

    if (input.verificationStatus === 'verified') {
      if (existing.dataSource === 'user_custom' && !input.dataSource) {
        throw new AppError(
          'bad_request',
          'VALIDATION_FAILED',
          'Must specify an authoritative data source (e.g. usda_fdc, manufacturer_label) when verifying food.',
        );
      }

      patch.isVerified = true;
      patch.isCustom = false;
      patch.createdBy = null;
      if (input.dataSource) {
        patch.dataSource = input.dataSource;
      }
      if (input.sourceId !== undefined) {
        patch.sourceId = input.sourceId?.trim() || null;
      }
    } else {
      patch.isVerified = false;
      if (!existing.createdBy) {
        patch.createdBy = input.adminId;
      }
      if (input.dataSource) {
        patch.dataSource = input.dataSource;
      }
      if (input.sourceId !== undefined) {
        patch.sourceId = input.sourceId?.trim() || null;
      }
    }

    const updated = await this.foodRepo.update(input.foodId, patch, null);
    if (!updated) {
      throw new AppError('internal', 'INTERNAL_ERROR', 'Failed to update food verification status.');
    }

    await this.auditLogger.logAction(
      input.adminId,
      'nutrition.food.verify',
      {
        foodId: updated.id,
        name: updated.name,
        verificationStatus: updated.verificationStatus,
        isVerified: updated.isVerified,
      },
      null,
      input.ipAddress,
      input.userAgent,
    );

    return toAdminFoodView(updated);
  }
}
