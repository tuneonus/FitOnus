import { z } from 'zod';
import { AI_ESTIMATE_LIMITS } from '../domain/nutrition-limits.js';
import { aiHintSchema, detectedFoodItemSchema } from './meal-photo.schemas.js';

export const multimodalMealResponseSchema = z.object({
  modalitiesUsed: z.array(z.enum(['text', 'audio', 'image'])),
  isFood: z.boolean(),
  summary: z.string(),
  transcript: z.string(),
  detectedLanguage: z.string(),
  items: z.array(detectedFoodItemSchema),
  overallConfidence: z.number(),
  confidence: z.enum(['high', 'medium', 'low']),
  totalKcal: z.number(),
  totalProteinGrams: z.number(),
  totalCarbsGrams: z.number(),
  totalFatGrams: z.number(),
  totalFiberGrams: z.number(),
  unclearReason: z.string().optional(),
  uncertaintyNote: z.string().optional(),
  medicalDisclaimer: z.string(),
  analyzedAt: z.string(),
});

export const analyzeMultimodalMealRequest = {
  body: z
    .object({
      image: z.string().min(1).optional(),
      imageMimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic']).default('image/jpeg').optional(),
      audio: z.string().min(1).optional(),
      audioMimeType: z.string().max(100).optional(),
      transcript: z.string().max(AI_ESTIMATE_LIMITS.transcriptLength).optional(),
      mealType: aiHintSchema.optional(),
      lang: aiHintSchema.optional(),
      notes: z.string().max(AI_ESTIMATE_LIMITS.notesLength).optional(),
      dietaryGoal: z.string().max(80).optional(),
      allergies: z.array(z.string().max(40)).max(10).optional(),
      dailyCalorieTarget: z.number().int().min(500).max(10_000).optional(),
    })
    .refine(
      (data) =>
        Boolean(
          (data.image && data.image.trim()) ||
            (data.audio && data.audio.trim()) ||
            (data.transcript && data.transcript.trim()),
        ),
      {
        message: 'At least one of image, audio, or transcript must be provided.',
        path: ['transcript'],
      },
    ),
};
