export type FoodDataSource =
  | 'usda_fdc'
  | 'open_food_facts'
  | 'manufacturer_label'
  | 'user_custom';

export type VerificationStatus = 'verified' | 'unverified' | 'rejected';

export type ServingBasis = '100g' | 'serving' | '100ml';

export interface ReferenceNutrients {
  calories: number;
  proteinG: number;
  carbohydratesG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
  cholesterolMg: number;
}

export interface CalculatedNutrients {
  effectiveWeightG: number;
  servingMultiplier: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export interface AdminFood {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  servingSize: number;
  servingUnit: string;
  servingWeightG: number;
  servingVolumeMl: number | null;
  densityGPerMl: number | null;
  servingBasis: ServingBasis;
  referenceNutrients: ReferenceNutrients;
  standardServingNutrients: CalculatedNutrients;
  isCustom: boolean;
  isVerified: boolean;
  dataSource: FoodDataSource;
  sourceId: string | null;
  verificationStatus: VerificationStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface NutritionCatalogStats {
  totalVerifiedFoods: number;
  totalCustomFoods: number;
  totalMealsLogged: number;
  totalMealItemsLogged: number;
  totalWaterLogs: number;
  verifiedFoodsBySource: Record<string, number>;
}

export interface FoodListQuery {
  q?: string;
  page?: number;
  limit?: number;
  dataSource?: string;
  verificationStatus?: string;
  isCustom?: boolean;
  includeDeleted?: boolean;
}

export interface CreateFoodInput {
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
  dataSource: 'usda_fdc' | 'open_food_facts' | 'manufacturer_label';
  sourceId?: string | null;
}

export interface UpdateFoodInput {
  name?: string;
  brand?: string | null;
  barcode?: string | null;
  servingSize?: number;
  servingUnit?: string;
  servingWeightG?: number;
  servingVolumeMl?: number | null;
  densityGPerMl?: number | null;
  servingBasis?: ServingBasis;
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
}

export interface VerifyFoodInput {
  verificationStatus: VerificationStatus;
  dataSource?: 'usda_fdc' | 'open_food_facts' | 'manufacturer_label';
  sourceId?: string | null;
}

