import { z } from 'zod';

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
    mealType: z.string().optional(),
    notes: z.string().max(250).optional(),
  }),
};
