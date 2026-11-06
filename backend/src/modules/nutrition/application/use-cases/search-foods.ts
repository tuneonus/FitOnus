import type { IFoodFavoriteRepository, IFoodRepository } from '../ports.js';
import { toFoodView, type FoodView } from '../nutrition-view.js';

export interface SearchFoodsInput {
  query?: string;
  userId: string;
  page?: number;
  limit?: number;
  isVerifiedOnly?: boolean;
}

export interface SearchFoodsResult {
  foods: FoodView[];
  total: number;
  page: number;
  limit: number;
}

export class SearchFoodsUseCase {
  constructor(
    private readonly foodRepo: IFoodRepository,
    private readonly favoriteRepo: IFoodFavoriteRepository,
  ) {}

  async execute(input: SearchFoodsInput): Promise<SearchFoodsResult> {
    const page = Math.max(1, input.page ?? 1);
    const limit = Math.min(50, Math.max(1, input.limit ?? 20));
    const offset = (page - 1) * limit;

    const { foods, total } = await this.foodRepo.search({
      query: input.query?.trim(),
      userId: input.userId,
      offset,
      limit,
      isVerifiedOnly: input.isVerifiedOnly,
    });

    const favoriteIds = new Set(await this.favoriteRepo.listFavoriteFoodIds(input.userId));
    const foodViews = foods.map((food) => toFoodView(food, favoriteIds.has(food.id)));

    return {
      foods: foodViews,
      total,
      page,
      limit,
    };
  }
}

