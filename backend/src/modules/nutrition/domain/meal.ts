export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface MealItemProps {
  id: string;
  mealId: string;
  foodId: string | null;
  foodName: string;
  foodBrand?: string | null;
  servingSize: number;
  servingUnit: string;
  servingWeightG: number;
  servingMultiplier: number;
  loggedWeightG: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  createdAt?: Date;
}

export class MealItem {
  readonly id: string;
  readonly mealId: string;
  readonly foodId: string | null;
  readonly foodName: string;
  readonly foodBrand: string | null;
  readonly servingSize: number;
  readonly servingUnit: string;
  readonly servingWeightG: number;
  readonly servingMultiplier: number;
  readonly loggedWeightG: number;
  readonly calories: number;
  readonly proteinG: number;
  readonly carbsG: number;
  readonly fatG: number;
  readonly fiberG: number;
  readonly createdAt: Date;

  constructor(props: MealItemProps) {
    if (!props.id) throw new Error('Meal item id is required');
    if (!props.mealId) throw new Error('Meal item must be linked to a mealId');
    if (!props.foodName || props.foodName.trim().length === 0) {
      throw new Error('Meal item foodName is required');
    }
    if (props.servingSize <= 0) throw new Error('Meal item servingSize must be greater than 0');
    if (props.servingWeightG <= 0) throw new Error('Meal item servingWeightG must be greater than 0');
    if (props.servingMultiplier <= 0) {
      throw new Error('Meal item servingMultiplier must be greater than 0');
    }
    if (props.loggedWeightG <= 0) throw new Error('Meal item loggedWeightG must be greater than 0');
    if (props.calories < 0) throw new Error('Meal item calories cannot be negative');

    this.id = props.id;
    this.mealId = props.mealId;
    this.foodId = props.foodId ?? null;
    this.foodName = props.foodName.trim();
    this.foodBrand = props.foodBrand ? props.foodBrand.trim() : null;
    this.servingSize = props.servingSize;
    this.servingUnit = props.servingUnit.trim();
    this.servingWeightG = props.servingWeightG;
    this.servingMultiplier = props.servingMultiplier;
    this.loggedWeightG = props.loggedWeightG;
    this.calories = props.calories;
    this.proteinG = props.proteinG;
    this.carbsG = props.carbsG;
    this.fatG = props.fatG;
    this.fiberG = props.fiberG;
    this.createdAt = props.createdAt ?? new Date();
  }
}

export interface MealProps {
  id: string;
  userId: string;
  mealType: MealType;
  date: string; // ISO YYYY-MM-DD
  totalCalories?: number;
  totalProteinG?: number;
  totalCarbsG?: number;
  totalFatG?: number;
  totalFiberG?: number;
  notes?: string | null;
  items?: MealItem[];
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
}

export class Meal {
  readonly id: string;
  readonly userId: string;
  readonly mealType: MealType;
  readonly date: string;
  totalCalories: number = 0;
  totalProteinG: number = 0;
  totalCarbsG: number = 0;
  totalFatG: number = 0;
  totalFiberG: number = 0;
  notes: string | null;
  items: MealItem[];
  readonly createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;

  constructor(props: MealProps) {
    if (!props.id) throw new Error('Meal id is required');
    if (!props.userId) throw new Error('Meal user_id is required');
    if (!['breakfast', 'lunch', 'dinner', 'snack'].includes(props.mealType)) {
      throw new Error(`Invalid mealType "${props.mealType}". Must be breakfast, lunch, dinner, or snack.`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(props.date)) {
      throw new Error(`Invalid meal date format "${props.date}". Expected YYYY-MM-DD.`);
    }

    this.id = props.id;
    this.userId = props.userId;
    this.mealType = props.mealType;
    this.date = props.date;
    this.notes = props.notes ? props.notes.trim() : null;
    this.items = props.items ?? [];
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
    this.deletedAt = props.deletedAt ?? null;

    if (props.totalCalories !== undefined) {
      this.totalCalories = props.totalCalories;
      this.totalProteinG = props.totalProteinG ?? 0;
      this.totalCarbsG = props.totalCarbsG ?? 0;
      this.totalFatG = props.totalFatG ?? 0;
      this.totalFiberG = props.totalFiberG ?? 0;
    } else {
      this.recalculateTotals();
    }
  }

  isOwnedBy(userId: string): boolean {
    return this.userId === userId;
  }

  /**
   * Recalculates total nutritional values from currently attached meal items.
   */
  recalculateTotals(): void {
    let calories = 0;
    let protein = 0;
    let carbs = 0;
    let fat = 0;
    let fiber = 0;

    for (const item of this.items) {
      calories += item.calories;
      protein += item.proteinG;
      carbs += item.carbsG;
      fat += item.fatG;
      fiber += item.fiberG;
    }

    const round = (val: number, decimals: number) => {
      const f = Math.pow(10, decimals);
      return Math.round((val + Number.EPSILON) * f) / f;
    };

    this.totalCalories = round(calories, 1);
    this.totalProteinG = round(protein, 2);
    this.totalCarbsG = round(carbs, 2);
    this.totalFatG = round(fat, 2);
    this.totalFiberG = round(fiber, 2);
    this.updatedAt = new Date();
  }

  setItems(newItems: MealItem[]): void {
    this.items = [...newItems];
    this.recalculateTotals();
  }
}
