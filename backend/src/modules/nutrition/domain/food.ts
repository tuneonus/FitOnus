import {
  calculatePortionNutrients,
  getStandardServingNutrients,
  type CalculatedNutrients,
  type FoodNutritionBasis,
  type PortionSpecification,
} from './nutrition-calculator.js';

export type FoodDataSource = 'usda_fdc' | 'open_food_facts' | 'manufacturer_label' | 'user_custom';
export type VerificationStatus = 'verified' | 'unverified' | 'rejected';
export type ServingBasis = '100g' | 'serving' | '100ml';

export interface FoodProps {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  servingSize: number;
  servingUnit: string;
  servingWeightG: number;
  servingVolumeMl?: number | null;
  densityGPerMl?: number | null;
  servingBasis: ServingBasis;
  calories: number;
  proteinG: number;
  carbohydratesG: number;
  fatG: number;
  fiberG: number;
  sugarG?: number;
  sodiumMg?: number;
  cholesterolMg?: number;
  dataSource: FoodDataSource;
  sourceId?: string | null;
  isCustom: boolean;
  isVerified: boolean;
  verificationStatus: VerificationStatus;
  createdBy?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
}

export class Food implements FoodNutritionBasis {
  readonly id: string;
  readonly name: string;
  readonly brand: string | null;
  readonly barcode: string | null;
  readonly servingSize: number;
  readonly servingUnit: string;
  readonly servingWeightG: number;
  readonly servingVolumeMl: number | null;
  readonly densityGPerMl: number | null;
  readonly servingBasis: ServingBasis;
  readonly calories: number;
  readonly proteinG: number;
  readonly carbohydratesG: number;
  readonly fatG: number;
  readonly fiberG: number;
  readonly sugarG: number;
  readonly sodiumMg: number;
  readonly cholesterolMg: number;
  readonly dataSource: FoodDataSource;
  readonly sourceId: string | null;
  readonly isCustom: boolean;
  readonly isVerified: boolean;
  readonly verificationStatus: VerificationStatus;
  readonly createdBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;

  constructor(props: FoodProps) {
    if (!props.id) throw new Error('Food id is required');
    if (!props.name || props.name.trim().length === 0) throw new Error('Food name is required');
    if (props.servingSize <= 0) throw new Error('Serving size must be greater than 0');
    if (props.servingWeightG <= 0) throw new Error('Serving weight in grams must be greater than 0');
    if (props.calories < 0) throw new Error('Calories cannot be negative');

    // Strict ownership constraint validation:
    // If verified, it must be system-owned (createdBy is null) and cannot be custom
    if (props.isVerified && (props.isCustom || props.createdBy !== null)) {
      throw new Error('Verified food must be system-curated without an individual user creator');
    }
    // If custom, it must have a creator and cannot be verified
    if (props.isCustom && (!props.createdBy || props.isVerified)) {
      throw new Error('Custom food must belong to a specific user and cannot be marked as verified');
    }

    this.id = props.id;
    this.name = props.name.trim();
    this.brand = props.brand ? props.brand.trim() : null;
    this.barcode = props.barcode ? props.barcode.trim() : null;
    this.servingSize = props.servingSize;
    this.servingUnit = props.servingUnit.trim();
    this.servingWeightG = props.servingWeightG;
    this.servingVolumeMl = props.servingVolumeMl ?? null;
    this.densityGPerMl = props.densityGPerMl ?? null;
    this.servingBasis = props.servingBasis;
    this.calories = props.calories;
    this.proteinG = props.proteinG;
    this.carbohydratesG = props.carbohydratesG;
    this.fatG = props.fatG;
    this.fiberG = props.fiberG;
    this.sugarG = props.sugarG ?? 0;
    this.sodiumMg = props.sodiumMg ?? 0;
    this.cholesterolMg = props.cholesterolMg ?? 0;
    this.dataSource = props.dataSource;
    this.sourceId = props.sourceId ?? null;
    this.isCustom = props.isCustom;
    this.isVerified = props.isVerified;
    this.verificationStatus = props.verificationStatus;
    this.createdBy = props.createdBy ?? null;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
    this.deletedAt = props.deletedAt ?? null;
  }

  /**
   * Determines if this food item is visible to the given user.
   * System verified foods are visible to everyone.
   * Custom foods are visible ONLY to their creator.
   */
  isVisibleTo(requestingUserId?: string | null): boolean {
    if (this.deletedAt !== null) return false;
    if (this.isVerified) return true;
    if (this.isCustom && requestingUserId && this.createdBy === requestingUserId) {
      return true;
    }
    return false;
  }

  isOwnedBy(userId: string): boolean {
    return this.createdBy === userId;
  }

  calculatePortion(portion: PortionSpecification): CalculatedNutrients {
    return calculatePortionNutrients(this, portion);
  }

  getStandardServing(): CalculatedNutrients {
    return getStandardServingNutrients(this);
  }
}
