import type { IFoodFavoriteRepository, IFoodRepository } from '../ports.js';
import { toFoodView, type FoodView } from '../nutrition-view.js';

export interface GetRecentFoodsInput {
  userId: string;
  limit?: number;
}

export class GetRecentFoodsUseCase {
  constructor(
    private readonly foodRepo: IFoodRepository,
    private readonly favoriteRepo: IFoodFavoriteRepository,
  ) {}

  async execute(input: GetRecentFoodsInput): Promise<FoodView[]> {
    const limit = Math.min(30, Math.max(1, input.limit ?? 10));

    const [foods, favoriteIdsList] = await Promise.all([
      this.foodRepo.listRecent(input.userId, limit),
      this.favoriteRepo.listFavoriteFoodIds(input.userId),
    ]);

    const favoriteIds = new Set(favoriteIdsList);
    return foods.map((f) => toFoodView(f, favoriteIds.has(f.id)));
  }
}
