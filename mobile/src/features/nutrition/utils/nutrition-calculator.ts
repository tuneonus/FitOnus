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

/**
 * Maps a backend MealView DTO into a mobile MealEntry.
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
    items: meal.items.map((it) => {
      const unit = it.servingUnit || 'g';
      const serving = `${it.servingMultiplier}× ${it.servingSize} ${unit} (${Math.round(it.loggedWeightG)}g)`;
      return {
        id: it.id,
        name: it.foodName,
        brand: it.foodBrand || undefined,
        serving,
        kcal: Math.round(it.calories),
        protein: round1(it.proteinG),
        carbs: round1(it.carbsG),
        fat: round1(it.fatG),
        fiber: round1(it.fiberG),
        servingSize: it.servingSize,
        servingUnit: it.servingUnit,
        servingWeightG: it.servingWeightG,
        servingMultiplier: it.servingMultiplier,
      };
    }),
  };
}
