import { z } from 'zod';
import { AI_ESTIMATE_LIMITS as L } from '../domain/nutrition-limits.js';

export const pythonConfidence = z.enum(['high', 'medium', 'low']);

/**
 * One detected food as the Python AI service returns it, for both meal photo and voice meal. Every number and text
 * is bounded (`AI_ESTIMATE_LIMITS`), so even if the service were wrong or compromised, an absurd value is refused here
 * instead of reaching the member's diary. Mirrors ai-backend/src/onusfit_ai/contracts/common.py `DetectedFoodItem`.
 */
export const pythonDetectedFoodItemSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(L.nameLength),
  brand: z.string().max(100).nullish(),
  serving: z.string().max(L.servingTextLength),
  servingWeightG: z.number().positive().max(L.servingWeightG).nullish(),
  servingUnit: z.string().max(L.unitLength).nullish(),
  servingSize: z.number().positive().max(L.servingSize).nullish(),
  kcal: z.number().min(0).max(L.itemKcal),
  protein: z.number().min(0).max(L.itemMacroG),
  carbs: z.number().min(0).max(L.itemMacroG),
  fat: z.number().min(0).max(L.itemMacroG),
  fiber: z.number().min(0).max(L.itemFiberG).nullish(),
  confidence: pythonConfidence,
  isAiEstimated: z.boolean(),
});

export const pythonDetectedFoodItemsSchema = z.array(pythonDetectedFoodItemSchema).max(L.maxItems);

/** A meal total can be at most every item at its own maximum. */
export const pythonTotals = {
  kcal: z.number().min(0).max(L.maxItems * L.itemKcal),
  macroG: z.number().min(0).max(L.maxItems * L.itemMacroG),
  fiberG: z.number().min(0).max(L.maxItems * L.itemFiberG),
} as const;
