import type { IFoodRepository, NutritionCatalogStats } from '../ports.js';

export class AdminGetNutritionStatsUseCase {
  constructor(private readonly foodRepo: IFoodRepository) {}

  async execute(): Promise<NutritionCatalogStats> {
    return this.foodRepo.getCatalogStats();
  }
}

