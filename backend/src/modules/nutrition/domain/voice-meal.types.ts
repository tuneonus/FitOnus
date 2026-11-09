import type { DetectedFoodItem } from './meal-photo.types.js';

export interface VoiceMealParseInput {
  userId: string;
  transcript?: string;
  audioBase64?: string;
  mimeType?: string;
  lang?: string;
  mealType?: string;
}

export interface VoiceMealParseResult {
  transcript: string;
  detectedLanguage: string;
  items: DetectedFoodItem[];
  confidence: 'high' | 'medium' | 'low';
  totalKcal: number;
  totalProteinGrams: number;
  totalCarbsGrams: number;
  totalFatGrams: number;
  totalFiberGrams?: number;
  unclearReason?: string;
  parsedAt: string;
}
