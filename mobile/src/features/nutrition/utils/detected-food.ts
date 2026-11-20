import type { FoodItem } from '../types/nutrition';

/** What the backend sends for an item the AI recognised in a photo or a spoken/typed description. */
export interface DetectedFoodItemDto {
  id: string;
  name: string;
  brand?: string | undefined;
  serving: string;
  servingWeightG?: number | undefined;
  servingUnit?: string | undefined;
  servingSize?: number | undefined;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number | undefined;
  /** The model's own rating: a word, never a number. */
  confidence?: 'high' | 'medium' | 'low' | number | undefined;
  isAiEstimated?: boolean | undefined;
}

/** Below this score an item is flagged "low confidence" in the review screens. */
export const LOW_CONFIDENCE_THRESHOLD = 0.7;

/**
 * The UI works with a 0..1 score and shows it as a percentage. The model only says high / medium / low, so each
 * word maps to one fixed score; "low" lands under {@link LOW_CONFIDENCE_THRESHOLD}, the other two above it.
 * A number is passed through (clamped) and anything else means "unknown" (the UI then says "AI estimate").
 */
export function confidenceToScore(
  confidence: DetectedFoodItemDto['confidence'],
): number | undefined {
  if (confidence === 'high') return 0.95;
  if (confidence === 'medium') return 0.8;
  if (confidence === 'low') return 0.6;
  if (typeof confidence === 'number' && Number.isFinite(confidence)) {
    return Math.min(1, Math.max(0, confidence));
  }
  return undefined;
}

/**
 * One mapping for every AI source (photo and voice), so they cannot drift apart again. The result is an
 * estimate by definition: `estimated` is set, `foodId` is null (nothing in the catalog backs it), and the brand
 * label the AI parser stamped is kept because it is how a saved item is recognised as an estimate afterwards.
 */
export function mapDetectedFoodItem(item: DetectedFoodItemDto): FoodItem {
  const score = confidenceToScore(item.confidence);
  return {
    id: item.id,
    foodId: null,
    name: item.name,
    brand: item.brand,
    serving: item.serving,
    servingSize: item.servingSize,
    servingUnit: item.servingUnit,
    servingWeightG: item.servingWeightG,
    kcal: item.kcal,
    protein: item.protein,
    carbs: item.carbs,
    fat: item.fat,
    fiber: item.fiber ?? 0,
    estimated: item.isAiEstimated ?? true,
    ...(score !== undefined ? { confidence: score } : {}),
  };
}
