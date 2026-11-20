import { z } from 'zod';
import { AI_ESTIMATE_LIMITS } from '../domain/nutrition-limits.js';

/**
 * A short label a member's app sends as a hint to the AI (meal type, language): words, digits, spaces and a little
 * punctuation. It goes into a prompt, so free text with quotes, brackets or line breaks is refused here (the Python
 * service also flattens whatever it receives).
 */
export const aiHintSchema = z
  .string()
  .max(AI_ESTIMATE_LIMITS.hintLength)
  .regex(/^[\p{L}\p{M}\p{N} _.,'-]*$/u, 'Use letters, numbers and spaces only');

export const detectedFoodItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  brand: z.string().optional(),
  serving: z.string(),
  servingWeightG: z.number().optional(),
  servingUnit: z.string().optional(),
  servingSize: z.number().optional(),
  kcal: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  fiber: z.number().optional(),
  confidence: z.enum(['high', 'medium', 'low']),
  isAiEstimated: z.boolean(),
});

export const mealPhotoResponseSchema = z.object({
  isFood: z.boolean(),
  summary: z.string(),
  items: z.array(detectedFoodItemSchema),
  overallConfidence: z.number(),
  totalKcal: z.number(),
  totalProteinGrams: z.number(),
  totalCarbsGrams: z.number(),
  totalFatGrams: z.number(),
  totalFiberGrams: z.number(),
  unclearReason: z.string().optional(),
  analyzedAt: z.string(),
});

export const analyzeMealPhotoRequest = {
  body: z.object({
    image: z.string().min(1, 'Image data is required'),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic']).default('image/jpeg'),
    mealType: aiHintSchema.optional(),
    notes: z.string().max(AI_ESTIMATE_LIMITS.notesLength).optional(),
  }),
};
