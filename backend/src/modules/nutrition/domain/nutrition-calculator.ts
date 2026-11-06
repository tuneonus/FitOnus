/**
 * Pure Domain Service: Nutrition Calculation Engine
 *
 * Implements the mathematical serving calculation contract for FitOnus.
 * Ensures that nutrient values stored per 100g basis are scaled accurately
 * by serving weight, unit volume, density, and multiplier without fabrication
 * or incorrect assumptions (e.g. 1ml != 1g).
 */

export interface FoodNutritionBasis {
  calories: number;
  proteinG: number;
  carbohydratesG: number;
  fatG: number;
  fiberG: number;
  servingSize: number;
  servingUnit: string;
  servingWeightG: number;
  servingVolumeMl?: number | null;
  densityGPerMl?: number | null;
  servingBasis: '100g' | 'serving' | '100ml';
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

export type PortionSpecification =
  | { type: 'multiplier'; value: number }
  | { type: 'weight_g'; value: number }
  | { type: 'volume_ml'; value: number };

function round(val: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round((val + Number.EPSILON) * factor) / factor;
}

/**
 * Calculates effective weight in grams for a given portion specification.
 */
export function resolveEffectiveWeightG(food: FoodNutritionBasis, portion: PortionSpecification): {
  effectiveWeightG: number;
  servingMultiplier: number;
} {
  switch (portion.type) {
    case 'multiplier': {
      if (portion.value <= 0) {
        throw new Error(`Serving multiplier must be greater than 0, received ${portion.value}`);
      }
      const effectiveWeightG = portion.value * food.servingWeightG;
      return { effectiveWeightG, servingMultiplier: portion.value };
    }
    case 'weight_g': {
      if (portion.value <= 0) {
        throw new Error(`Weight in grams must be greater than 0, received ${portion.value}`);
      }
      const servingMultiplier = food.servingWeightG > 0 ? portion.value / food.servingWeightG : 1.0;
      return { effectiveWeightG: portion.value, servingMultiplier };
    }
    case 'volume_ml': {
      if (portion.value <= 0) {
        throw new Error(`Volume in ml must be greater than 0, received ${portion.value}`);
      }
      let density: number;
      if (food.densityGPerMl && food.densityGPerMl > 0) {
        density = food.densityGPerMl;
      } else if (food.servingVolumeMl && food.servingVolumeMl > 0 && food.servingWeightG > 0) {
        density = food.servingWeightG / food.servingVolumeMl;
      } else if (food.servingUnit === 'ml') {
        density = food.servingWeightG / food.servingSize;
      } else {
        throw new Error(
          `Cannot calculate weight from volume for food "${food.servingUnit}" without defined density or volume ratio.`,
        );
      }
      const effectiveWeightG = portion.value * density;
      const servingMultiplier = food.servingWeightG > 0 ? effectiveWeightG / food.servingWeightG : 1.0;
      return { effectiveWeightG, servingMultiplier };
    }
    default: {
      const exhaustiveCheck: never = portion;
      throw new Error(`Unsupported portion type: ${JSON.stringify(exhaustiveCheck)}`);
    }
  }
}

/**
 * Calculates scaled nutrients for a food item given an arbitrary portion specification.
 */
export function calculatePortionNutrients(
  food: FoodNutritionBasis,
  portion: PortionSpecification,
): CalculatedNutrients {
  const { effectiveWeightG, servingMultiplier } = resolveEffectiveWeightG(food, portion);

  let scaleRatio: number;
  if (food.servingBasis === '100g') {
    scaleRatio = effectiveWeightG / 100.0;
  } else if (food.servingBasis === 'serving') {
    scaleRatio = food.servingWeightG > 0 ? effectiveWeightG / food.servingWeightG : servingMultiplier;
  } else if (food.servingBasis === '100ml') {
    let volumeMl: number;
    if (food.densityGPerMl && food.densityGPerMl > 0) {
      volumeMl = effectiveWeightG / food.densityGPerMl;
    } else {
      volumeMl = effectiveWeightG; // default 1:1 if 100ml basis without specific density
    }
    scaleRatio = volumeMl / 100.0;
  } else {
    scaleRatio = effectiveWeightG / 100.0;
  }

  return {
    effectiveWeightG: round(effectiveWeightG, 2),
    servingMultiplier: round(servingMultiplier, 4),
    calories: round(food.calories * scaleRatio, 1),
    proteinG: round(food.proteinG * scaleRatio, 2),
    carbsG: round(food.carbohydratesG * scaleRatio, 2),
    fatG: round(food.fatG * scaleRatio, 2),
    fiberG: round(food.fiberG * scaleRatio, 2),
  };
}

/**
 * Convenience helper: Calculate nutrients for a serving multiplier (e.g. 1.0, 1.5, 2.0).
 */
export function calculateByServingMultiplier(
  food: FoodNutritionBasis,
  multiplier: number,
): CalculatedNutrients {
  return calculatePortionNutrients(food, { type: 'multiplier', value: multiplier });
}

/**
 * Convenience helper: Calculate nutrients for an exact weight in grams (e.g. 75g).
 */
export function calculateByWeightGrams(food: FoodNutritionBasis, weightG: number): CalculatedNutrients {
  return calculatePortionNutrients(food, { type: 'weight_g', value: weightG });
}

/**
 * Convenience helper: Calculate nutrients for an exact volume in milliliters (e.g. 15ml, 250ml).
 */
export function calculateByVolumeMl(food: FoodNutritionBasis, volumeMl: number): CalculatedNutrients {
  return calculatePortionNutrients(food, { type: 'volume_ml', value: volumeMl });
}

/**
 * Computes the nutrients for 1 standard serving of the food (for mobile UI display / API DTO).
 */
export function getStandardServingNutrients(food: FoodNutritionBasis): CalculatedNutrients {
  return calculateByServingMultiplier(food, 1.0);
}

