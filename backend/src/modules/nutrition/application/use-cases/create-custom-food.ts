import crypto from 'node:crypto';
import { AppError } from '../../../../shared/errors/app-error.js';
import type { IFoodRepository } from '../ports.js';
import { toFoodView, type FoodView } from '../nutrition-view.js';
import { Food, type ServingBasis } from '../../domain/food.js';
import {
  FOOD_BARCODE_MAX_LENGTH,
  FOOD_BRAND_MAX_LENGTH,
  FOOD_NAME_MAX_LENGTH,
  SERVING_UNIT_MAX_LENGTH,
  assertFoodWithinLimits,
  assertMaxLength,
} from '../../domain/nutrition-limits.js';

export interface CreateCustomFoodInput {
  id?: string;
  userId: string;
  name: string;
  brand?: string | null;
  barcode?: string | null;
  servingSize: number;
  servingUnit: string;
  servingWeightG: number;
  servingVolumeMl?: number | null;
  densityGPerMl?: number | null;
  servingBasis?: ServingBasis;
  calories: number;
  proteinG: number;
  carbohydratesG: number;
  fatG: number;
  fiberG?: number;
  sugarG?: number | null;
  sodiumMg?: number | null;
  cholesterolMg?: number | null;
}

export class CreateCustomFoodUseCase {
  constructor(private readonly foodRepo: IFoodRepository) {}

  async execute(input: CreateCustomFoodInput): Promise<FoodView> {
    if (!input.name || input.name.trim().length === 0) {
      throw new AppError('bad_request', 'VALIDATION_FAILED', 'Food name is required');
    }
    if (!input.servingUnit || input.servingUnit.trim().length === 0) {
      throw new AppError('bad_request', 'VALIDATION_FAILED', 'Serving unit is required');
    }
    if (input.servingSize <= 0) {
      throw new AppError('bad_request', 'VALIDATION_FAILED', 'Serving size must be greater than 0');
    }
    if (input.servingWeightG <= 0) {
      throw new AppError(
        'bad_request',
        'VALIDATION_FAILED',
        'Serving weight in grams must be greater than 0',
      );
    }
    if (input.calories < 0 || input.proteinG < 0 || input.carbohydratesG < 0 || input.fatG < 0) {
      throw new AppError('bad_request', 'VALIDATION_FAILED', 'Nutrient values cannot be negative');
    }
    // Every number below ends up in a fixed-size NUMERIC column: refuse values the column cannot hold.
    assertFoodWithinLimits(input);
    assertMaxLength('name', input.name.trim(), FOOD_NAME_MAX_LENGTH);
    assertMaxLength('brand', input.brand?.trim(), FOOD_BRAND_MAX_LENGTH);
    assertMaxLength('barcode', input.barcode?.trim(), FOOD_BARCODE_MAX_LENGTH);
    assertMaxLength('servingUnit', input.servingUnit.trim(), SERVING_UNIT_MAX_LENGTH);

    const foodId = input.id ?? crypto.randomUUID();

    if (input.id) {
      const existing = await this.foodRepo.findById(input.id);
      if (existing) {
        if (existing.createdBy !== input.userId) {
          throw new AppError('conflict', 'CONFLICT', 'Food ID collision with another user');
        }
        // Safe idempotent return
        return toFoodView(existing, false);
      }
    }

    const now = new Date();
    const food = new Food({
      id: foodId,
      name: input.name.trim(),
      brand: input.brand?.trim() ?? null,
      barcode: input.barcode?.trim() ?? null,
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
      dataSource: 'user_custom',
      sourceId: null,
      isCustom: true,
      isVerified: false,
      verificationStatus: 'unverified',
      createdBy: input.userId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const saved = await this.foodRepo.create(food);
    return toFoodView(saved, false);
  }
}
