import { AppError } from '../../../../shared/errors/app-error.js';
import type { IFoodFavoriteRepository, IFoodRepository } from '../ports.js';
import { toFoodView, type FoodView } from '../nutrition-view.js';

export interface ListFavoritesResult {
  foods: FoodView[];
  total: number;
  page: number;
  limit: number;
}

export class ManageFoodFavoritesUseCase {
  constructor(
    private readonly favoriteRepo: IFoodFavoriteRepository,
    private readonly foodRepo: IFoodRepository,
  ) {}

  private async assertFoodAccessible(userId: string, foodId: string): Promise<void> {
    const food = await this.foodRepo.findById(foodId, userId);
    if (!food) {
      const unconstrained = await this.foodRepo.findById(foodId);
      if (unconstrained && unconstrained.isCustom && unconstrained.createdBy !== userId) {
        throw new AppError('forbidden', 'FORBIDDEN', "Cannot favorite another user's private custom food");
      }
      throw new AppError('not_found', 'NOT_FOUND', 'Food not found');
    }
  }

  async toggleFavorite(userId: string, foodId: string): Promise<{ foodId: string; isFavorite: boolean }> {
    const isCurrentlyFav = await this.favoriteRepo.isFavorite(userId, foodId);
    if (isCurrentlyFav) {
      await this.favoriteRepo.removeFavorite(userId, foodId);
      return { foodId, isFavorite: false };
    }

    await this.assertFoodAccessible(userId, foodId);
    await this.favoriteRepo.addFavorite(userId, foodId);
    return { foodId, isFavorite: true };
  }

  async addFavorite(userId: string, foodId: string): Promise<void> {
    await this.assertFoodAccessible(userId, foodId);
    await this.favoriteRepo.addFavorite(userId, foodId);
  }

  async removeFavorite(userId: string, foodId: string): Promise<void> {
    await this.favoriteRepo.removeFavorite(userId, foodId);
  }

  async listFavorites(userId: string, page = 1, limit = 20): Promise<ListFavoritesResult> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const offset = (safePage - 1) * safeLimit;

    const { foods, total } = await this.foodRepo.listFavorites(userId, safeLimit, offset);
    const foodViews = foods.map((f) => toFoodView(f, true));

    return {
      foods: foodViews,
      total,
      page: safePage,
      limit: safeLimit,
    };
  }
}
