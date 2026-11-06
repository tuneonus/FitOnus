import { AppError } from '../../../../shared/errors/app-error.js';
import type { IFoodFavoriteRepository, IFoodRepository } from '../ports.js';
import { toFoodView, type FoodView } from '../nutrition-view.js';
import type { Food } from '../../domain/food.js';

export interface GetFoodDetailsInput {
  id?: string;
  barcode?: string;
  userId: string;
}

export class GetFoodDetailsUseCase {
  constructor(
    private readonly foodRepo: IFoodRepository,
    private readonly favoriteRepo: IFoodFavoriteRepository,
  ) {}

  async execute(input: GetFoodDetailsInput): Promise<FoodView> {
    if (!input.id && !input.barcode) {
      throw new AppError('bad_request', 'VALIDATION_FAILED', 'Food id or barcode is required');
    }

    let food: Food | null = null;

    if (input.id) {
      food = await this.foodRepo.findById(input.id, input.userId);
      if (!food) {
        // Distinguish between private custom food of another user vs truly not found
        const unconstrainedFood = await this.foodRepo.findById(input.id);
        if (
          unconstrainedFood &&
          unconstrainedFood.isCustom &&
          unconstrainedFood.createdBy !== input.userId
        ) {
          throw new AppError('forbidden', 'FORBIDDEN', 'Access to this custom food is forbidden');
        }
        throw new AppError('not_found', 'NOT_FOUND', 'Food not found');
      }
    } else if (input.barcode) {
      food = await this.foodRepo.findByBarcode(input.barcode.trim(), input.userId);
      if (!food) {
        throw new AppError('not_found', 'NOT_FOUND', 'Food with barcode not found');
      }
    }

    if (!food) {
      throw new AppError('not_found', 'NOT_FOUND', 'Food not found');
    }

    const isFavorite = await this.favoriteRepo.isFavorite(input.userId, food.id);
    return toFoodView(food, isFavorite);
  }
}

