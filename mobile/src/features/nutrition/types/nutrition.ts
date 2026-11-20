export type MealType = 'breakfast' | 'lunch' | 'snacks' | 'dinner';
export type DbMealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export function toDbMealType(type: MealType): DbMealType {
  if (type === 'snacks') return 'snack';
  return type;
}

export function toUiMealType(type: DbMealType | string): MealType {
  if (type === 'snack') return 'snacks';
  if (type === 'breakfast' || type === 'lunch' || type === 'dinner' || type === 'snacks') {
    return type;
  }
  return 'lunch';
}

export type EntryMethod = 'search' | 'photo' | 'barcode' | 'voice' | 'manual' | 'coach';

export type Nutrients = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
};

export interface ReferenceNutrients {
  calories: number;
  proteinG: number;
  carbohydratesG: number;
  fatG: number;
  fiberG: number;
  sugarG?: number | null | undefined;
  sodiumMg?: number | null | undefined;
  cholesterolMg?: number | null | undefined;
}

export type FoodItem = Nutrients & {
  /**
   * Stable identity of this row in the UI. For a catalog food it is the food id; for an item read back from a saved
   * meal it is the meal-item id; for AI items it is a client-made id. It is NEVER sent to the backend as a food id:
   * `foodId` below is the only field that names a catalog food.
   */
  id: string;
  name: string;
  serving: string;
  brand?: string | undefined;
  /** Estimated values come from AI photo analysis or coach guesses. */
  estimated?: boolean | undefined;
  /** 0..1. AI items carry the model's high/medium/low mapped by `confidenceToScore`. */
  confidence?: number | undefined;

  /** The catalog food this item was priced from, or null for AI and hand-entered items. Absent = not catalog-linked. */
  foodId?: string | null | undefined;
  /** Set when the item was read back from a saved meal: the stored item an edit refers to. */
  mealItemId?: string | undefined;
  /** The exact weight that was logged for a saved item (kept so edits can scale from it without rounding drift). */
  loggedWeightG?: number | undefined;

  // Authoritative physical serving contract & backend metadata
  barcode?: string | null | undefined;
  servingSize?: number | undefined;
  servingUnit?: string | undefined;
  servingWeightG?: number | undefined;
  servingVolumeMl?: number | null | undefined;
  densityGPerMl?: number | null | undefined;
  servingBasis?: '100g' | 'serving' | '100ml' | undefined;
  referenceNutrients?: ReferenceNutrients | undefined;
  servingMultiplier?: number | undefined;
  isCustom?: boolean | undefined;
  isVerified?: boolean | undefined;
  isFavorite?: boolean | undefined;
  dataSource?: string | undefined;
};

export type MealEntry = {
  id: string;
  meal: MealType;
  time: string;
  method: EntryMethod;
  items: FoodItem[];
  date?: string | undefined; // YYYY-MM-DD
  notes?: string | null | undefined;
  isSynced?: boolean | undefined;
};

// --- Backend API DTOs ---

export interface BackendFoodView {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  servingSize: number;
  servingUnit: string;
  servingWeightG: number;
  servingVolumeMl: number | null;
  densityGPerMl: number | null;
  servingBasis: '100g' | 'serving' | '100ml';
  referenceNutrients: {
    calories: number;
    proteinG: number;
    carbohydratesG: number;
    fatG: number;
    fiberG: number;
    sugarG?: number | undefined;
    sodiumMg?: number | undefined;
    cholesterolMg?: number | undefined;
  };
  standardServingNutrients: {
    effectiveWeightG: number;
    servingMultiplier: number;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
  };
  isCustom: boolean;
  isVerified: boolean;
  isFavorite?: boolean | undefined;
  dataSource?: string | undefined;
}

export interface BackendMealItemView {
  id: string;
  foodId: string | null;
  foodName: string;
  foodBrand: string | null;
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
  /** True for values an AI parser estimated (photo or voice). */
  isEstimated?: boolean | undefined;
}

export interface BackendMealView {
  id: string;
  userId: string;
  mealType: DbMealType;
  date: string;
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  totalFiberG: number;
  notes: string | null;
  items: BackendMealItemView[];
  createdAt: string;
  updatedAt: string;
}

/** Where a goal came from: the member's own saved goal, or an estimate worked out from their profile. */
export type TargetSource = 'saved' | 'estimated';

export interface DailyNutritionTargets {
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  waterMl: number | null;
  /** Where calories, protein, carbs and fat came from (absent from an older backend). */
  source?: TargetSource | null | undefined;
  /** Where the water goal came from: the member's own, or 35 ml/kg of their weight as a starting estimate. */
  waterSource?: TargetSource | null | undefined;
}

/** The daily water goal now in effect, as the backend answers a change. */
export interface WaterTargetView {
  targetMl: number | null;
  source: TargetSource | null;
}

export interface DailyNutritionConsumed {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  waterMl: number;
}

export interface DailyNutritionRemaining {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  waterMl: number;
}

export interface DailyNutritionView {
  date: string;
  targets: DailyNutritionTargets | null;
  consumed: DailyNutritionConsumed;
  remaining: DailyNutritionRemaining | null;
  meals: BackendMealView[];
  /** The day's individual water entries, oldest first (absent from an older backend). */
  waterEntries?: WaterIntakeView[] | undefined;
}

export interface WaterIntakeView {
  id: string;
  userId: string;
  date: string;
  amountMl: number;
  loggedAt: string;
  createdAt: string;
}

export interface DailyTrendPoint {
  date: string;
  label: string;
  value: number;
}

export interface MacroSplitView {
  label: 'Protein' | 'Carbs' | 'Fat';
  pct: number;
  grams: number;
}

export interface TopFoodView {
  foodName: string;
  count: number;
  totalCalories: number;
}

export interface NutritionAnalyticsView {
  range: 'week' | 'month';
  startDate: string;
  endDate: string;
  avgCalories: number;
  avgProtein: number;
  targetCalories: number | null;
  targetProtein: number | null;
  loggedDaysCount: number;
  totalDaysInRange: number;
  caloriesTrend: DailyTrendPoint[];
  proteinTrend: DailyTrendPoint[];
  macroSplit: MacroSplitView[];
  topFoods: TopFoodView[];
}

export interface CreateCustomFoodInput {
  id?: string | undefined;
  name: string;
  brand?: string | null | undefined;
  barcode?: string | null | undefined;
  servingSize: number;
  servingUnit: string;
  servingWeightG: number;
  servingVolumeMl?: number | null | undefined;
  densityGPerMl?: number | null | undefined;
  servingBasis?: '100g' | 'serving' | '100ml' | undefined;
  calories: number;
  proteinG: number;
  carbohydratesG: number;
  fatG: number;
  fiberG?: number | undefined;
  sugarG?: number | null | undefined;
  sodiumMg?: number | null | undefined;
  cholesterolMg?: number | null | undefined;
}

export interface LogMealItemInput {
  /** Edit only: the stored item this line refers to. Its snapshot is kept; only the portion may change. */
  mealItemId?: string | undefined;
  foodId?: string | null | undefined;
  foodName?: string | undefined;
  foodBrand?: string | null | undefined;
  servingSize?: number | undefined;
  servingUnit?: string | undefined;
  servingWeightG?: number | undefined;
  servingMultiplier: number;
  loggedWeightG?: number | undefined;
  calories?: number | undefined;
  proteinG?: number | undefined;
  carbsG?: number | undefined;
  fatG?: number | undefined;
  fiberG?: number | undefined;
}

export interface LogMealInput {
  id?: string | undefined;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'snacks';
  date: string; // YYYY-MM-DD
  notes?: string | null | undefined;
  items: LogMealItemInput[];
}

export interface UpdateMealInput {
  mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'snacks' | undefined;
  date?: string | undefined;
  notes?: string | null | undefined;
  items?: LogMealItemInput[] | undefined;
}

export interface LogWaterInput {
  id?: string | undefined;
  date: string; // YYYY-MM-DD
  amountMl: number;
  loggedAt?: string | undefined;
}
