import type {
  BackendFoodView,
  BackendMealView,
  FoodItem,
  MealEntry,
  Nutrients,
  toUiMealType,
} from '../types/nutrition';

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

/**
 * Calculates exact portion nutrients according to the FitOnus serving calculation contract.
 */
export function calculatePortionNutrients(
  food: FoodItem,
  multiplier: number
): Nutrients & { effectiveWeightG: number; servingText: string } {
  const m = Math.max(0, multiplier);
  const baseWeight = food.servingWeightG ?? 100;
  const basis = food.servingBasis ?? '100g';

  let kcal = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  let fiber = 0;
  let effectiveWeightG = m * baseWeight;

  if (food.referenceNutrients) {
    const ref = food.referenceNutrients;
    if (basis === '100g') {
      const factor = effectiveWeightG / 100;
      kcal = Math.round(factor * ref.calories);
      protein = round1(factor * ref.proteinG);
      carbs = round1(factor * ref.carbohydratesG);
      fat = round1(factor * ref.fatG);
      fiber = round1(factor * ref.fiberG);
    } else if (basis === 'serving') {
      kcal = Math.round(m * ref.calories);
      protein = round1(m * ref.proteinG);
      carbs = round1(m * ref.carbohydratesG);
      fat = round1(m * ref.fatG);
      fiber = round1(m * ref.fiberG);
    } else if (basis === '100ml') {
      const density = food.densityGPerMl && food.densityGPerMl > 0 ? food.densityGPerMl : 1.0;
      const baseVol = food.servingVolumeMl && food.servingVolumeMl > 0 ? food.servingVolumeMl : baseWeight;
      const effectiveVol = m * baseVol;
      effectiveWeightG = effectiveVol * density;
      const factor = effectiveVol / 100;
      kcal = Math.round(factor * ref.calories);
      protein = round1(factor * ref.proteinG);
      carbs = round1(factor * ref.carbohydratesG);
      fat = round1(factor * ref.fatG);
      fiber = round1(factor * ref.fiberG);
    }
  } else {
    // Fallback when reference nutrients are absent
    kcal = Math.round(food.kcal * m);
    protein = round1(food.protein * m);
    carbs = round1(food.carbs * m);
    fat = round1(food.fat * m);
    fiber = round1(food.fiber * m);
  }

  const baseUnit = food.servingUnit || 'serving';
  const cleanServing = food.serving ? food.serving.replace(/^[\d.]+× /, '') : `${food.servingSize ?? 1} ${baseUnit}`;
  const servingText = m === 1 ? cleanServing : `${m}× ${cleanServing}`;

  return {
    kcal,
    protein,
    carbs,
    fat,
    fiber,
    effectiveWeightG: round1(effectiveWeightG),
    servingText,
  };
}

/**
 * Maps a backend FoodView DTO into the mobile client's FoodItem.
 */
export function mapBackendFoodToFoodItem(food: BackendFoodView): FoodItem {
  const std = food.standardServingNutrients;
  const unit = food.servingUnit || 'g';
  const serving = `${food.servingSize} ${unit}${food.servingWeightG ? ` · ${food.servingWeightG}g` : ''}`;

  return {
    id: food.id,
    // A catalog food: the only kind of item whose id is also a food id. Logging sends this, never `id`.
    foodId: food.id,
    name: food.name,
    brand: food.brand || undefined,
    barcode: food.barcode,
    serving,
    kcal: Math.round(std.calories),
    protein: round1(std.proteinG),
    carbs: round1(std.carbsG),
    fat: round1(std.fatG),
    fiber: round1(std.fiberG),
    servingSize: food.servingSize,
    servingUnit: food.servingUnit,
    servingWeightG: food.servingWeightG,
    servingVolumeMl: food.servingVolumeMl,
    densityGPerMl: food.densityGPerMl,
    servingBasis: food.servingBasis,
    referenceNutrients: food.referenceNutrients,
    servingMultiplier: 1.0,
    isCustom: food.isCustom,
    isVerified: food.isVerified,
    isFavorite: food.isFavorite ?? false,
    dataSource: food.dataSource,
  };
}

/** "2× 1 piece (100g)": the serving line of a logged item, from the multiplier and the exact logged weight. */
export function formatLoggedServing(
  multiplier: number,
  servingSize: number,
  servingUnit: string | undefined,
  loggedWeightG: number,
): string {
  return `${multiplier}× ${servingSize} ${servingUnit || 'g'} (${Math.round(loggedWeightG)}g)`;
}

/**
 * Maps a backend MealView DTO into a mobile MealEntry.
 *
 * A saved item is a frozen snapshot, so its numbers are carried exactly as stored (screens round when they
 * display). That keeps an edit or an undo from rewriting a snapshot with display-rounded values. Identity is kept
 * apart on purpose: `id`/`mealItemId` is the stored item, `foodId` is the catalog food it came from (or null).
 */
export function mapBackendMealToMealEntry(meal: BackendMealView): MealEntry {
  const timeFormatted = meal.createdAt
    ? new Date(meal.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : 'Logged';

  const uiMealType = meal.mealType === 'snack' ? 'snacks' : meal.mealType;

  return {
    id: meal.id,
    meal: uiMealType,
    time: timeFormatted,
    method: 'search',
    date: meal.date,
    notes: meal.notes,
    isSynced: true,
    items: meal.items.map((it) => ({
      id: it.id,
      mealItemId: it.id,
      foodId: it.foodId,
      loggedWeightG: it.loggedWeightG,
      name: it.foodName,
      brand: it.foodBrand || undefined,
      serving: formatLoggedServing(it.servingMultiplier, it.servingSize, it.servingUnit, it.loggedWeightG),
      kcal: it.calories,
      protein: it.proteinG,
      carbs: it.carbsG,
      fat: it.fatG,
      fiber: it.fiberG,
      servingSize: it.servingSize,
      servingUnit: it.servingUnit,
      servingWeightG: it.servingWeightG,
      servingMultiplier: it.servingMultiplier,
      estimated: it.isEstimated === true,
    })),
  };
}

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

/**
 * Scales an item by `factor` RELATIVE to its current portion, which is what the edit sheet shows: the sheet starts
 * at 1× (the portion as logged), so choosing 1.5× on an item logged at 2× means 3× of the base serving. The item's
 * `servingMultiplier` stays absolute (a multiple of the base serving), which is also what the backend stores.
 */
export function scaleFood(item: FoodItem, factor: number): FoodItem {
  const multiplier = Math.round((item.servingMultiplier ?? 1) * factor * 10_000) / 10_000;
  const loggedWeight =
    item.loggedWeightG !== undefined ? { loggedWeightG: round2(item.loggedWeightG * factor) } : {};

  if (item.referenceNutrients) {
    const portion = calculatePortionNutrients(item, multiplier);
    return {
      ...item,
      kcal: portion.kcal,
      protein: portion.protein,
      carbs: portion.carbs,
      fat: portion.fat,
      fiber: portion.fiber,
      serving: portion.servingText,
      servingMultiplier: multiplier,
      ...loggedWeight,
    };
  }

  const r = (n: number) => Math.round(n * factor * 10) / 10;
  const serving =
    item.loggedWeightG !== undefined && item.servingSize !== undefined
      ? formatLoggedServing(multiplier, item.servingSize, item.servingUnit, round2(item.loggedWeightG * factor))
      : multiplier === 1
        ? item.serving.replace(/^[\d.]+× /, '')
        : `${multiplier}× ${item.serving.replace(/^[\d.]+× /, '')}`;
  return {
    ...item,
    kcal: Math.round(item.kcal * factor),
    protein: r(item.protein),
    carbs: r(item.carbs),
    fat: r(item.fat),
    fiber: r(item.fiber),
    serving,
    servingMultiplier: multiplier,
    ...loggedWeight,
  };
}
