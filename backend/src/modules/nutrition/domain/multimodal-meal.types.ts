import type { DetectedFoodItem } from './meal-photo.types.js';

export type MultimodalModality = 'text' | 'audio' | 'image';

export interface MultimodalContextHint {
  mealType?: string;
  lang?: string;
  notes?: string;
  dietaryGoal?: string;
  allergies?: string[];
  dailyCalorieTarget?: number;
}

export interface MultimodalMealAnalysisInput {
  userId: string;
  imageBase64?: string;
  imageMimeType?: string;
  audioBase64?: string;
  audioMimeType?: string;
  transcript?: string;
  context?: MultimodalContextHint;
  signal?: AbortSignal;
}

export interface MultimodalMealAnalysisResult {
  modalitiesUsed: MultimodalModality[];
  isFood: boolean;
  summary: string;
  transcript: string;
  detectedLanguage: string;
  items: DetectedFoodItem[];
  overallConfidence: number;
  confidence: 'high' | 'medium' | 'low';
  totalKcal: number;
  totalProteinGrams: number;
  totalCarbsGrams: number;
  totalFatGrams: number;
  totalFiberGrams: number;
  unclearReason?: string;
  uncertaintyNote?: string;
  medicalDisclaimer: string;
  analyzedAt: string;
}
