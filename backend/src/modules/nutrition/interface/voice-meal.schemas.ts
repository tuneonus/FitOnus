import { z } from 'zod';
import { AI_ESTIMATE_LIMITS } from '../domain/nutrition-limits.js';
import { aiHintSchema, detectedFoodItemSchema } from './meal-photo.schemas.js';

export const voiceMealResponseSchema = z.object({
  transcript: z.string(),
  detectedLanguage: z.string(),
  items: z.array(detectedFoodItemSchema),
  confidence: z.enum(['high', 'medium', 'low']),
  totalKcal: z.number(),
  totalProteinGrams: z.number(),
  totalCarbsGrams: z.number(),
  totalFatGrams: z.number(),
  totalFiberGrams: z.number().optional(),
  unclearReason: z.string().optional(),
  parsedAt: z.string(),
});

export const parseVoiceMealRequest = {
  body: z
    .object({
      transcript: z.string().max(AI_ESTIMATE_LIMITS.transcriptLength).optional(),
      audio: z.string().optional(),
      mimeType: z.string().max(100).optional(),
      lang: aiHintSchema.optional(),
      mealType: aiHintSchema.optional(),
    })
    .refine((data) => Boolean((data.transcript && data.transcript.trim()) || (data.audio && data.audio.trim())), {
      message: 'Either spoken audio or transcript text must be provided.',
      path: ['transcript'],
    }),
};
