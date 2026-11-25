import { apiClient } from '@/services/api-client';
import type { FoodItem, MealType } from '@/features/nutrition/types/nutrition';
import {
  mapDetectedFoodItem,
  type DetectedFoodItemDto,
} from '@/features/nutrition/utils/detected-food';

export type MultimodalModality = 'text' | 'audio' | 'image';

export interface AnalyzeMultimodalMealParams {
  image?: string | undefined;
  imageMimeType?: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | undefined;
  audio?: string | undefined;
  audioMimeType?: string | undefined;
  transcript?: string | undefined;
  mealType?: MealType | undefined;
  lang?: string | undefined;
  notes?: string | undefined;
  dietaryGoal?: string | undefined;
  allergies?: string[] | undefined;
  dailyCalorieTarget?: number | undefined;
  signal?: AbortSignal | undefined;
}

export interface MultimodalMealBackendResponse {
  modalitiesUsed: MultimodalModality[];
  isFood: boolean;
  summary: string;
  transcript: string;
  detectedLanguage: string;
  items: DetectedFoodItemDto[];
  overallConfidence: number;
  confidence: 'high' | 'medium' | 'low';
  totalKcal: number;
  totalProteinGrams: number;
  totalCarbsGrams: number;
  totalFatGrams: number;
  totalFiberGrams: number;
  unclearReason?: string | undefined;
  uncertaintyNote?: string | undefined;
  medicalDisclaimer: string;
  analyzedAt: string;
}

export interface MultimodalMealAnalysisResult
  extends Omit<MultimodalMealBackendResponse, 'items'> {
  items: FoodItem[];
}

export function mapMultimodalMealResponse(
  data: MultimodalMealBackendResponse,
): MultimodalMealAnalysisResult {
  return { ...data, items: (data.items ?? []).map(mapDetectedFoodItem) };
}

export const MultimodalMealApi = {
  analyzeMultimodalMeal: async (
    params: AnalyzeMultimodalMealParams,
  ): Promise<MultimodalMealAnalysisResult> => {
    const response = await apiClient.post<{
      success: boolean;
      data: MultimodalMealBackendResponse;
      message?: string;
    }>(
      '/nutrition/multimodal/analyze',
      {
        ...(params.image ? { image: params.image, imageMimeType: params.imageMimeType || 'image/jpeg' } : {}),
        ...(params.audio ? { audio: params.audio, audioMimeType: params.audioMimeType || 'audio/m4a' } : {}),
        ...(params.transcript ? { transcript: params.transcript } : {}),
        ...(params.mealType ? { mealType: params.mealType } : {}),
        ...(params.lang ? { lang: params.lang } : {}),
        ...(params.notes ? { notes: params.notes } : {}),
        ...(params.dietaryGoal ? { dietaryGoal: params.dietaryGoal } : {}),
        ...(params.allergies ? { allergies: params.allergies } : {}),
        ...(params.dailyCalorieTarget !== undefined
          ? { dailyCalorieTarget: params.dailyCalorieTarget }
          : {}),
      },
      {
        timeout: 30_000,
        ...(params.signal ? { signal: params.signal } : {}),
      },
    );

    if (!response.data?.data) {
      throw new Error('Invalid response received from multimodal meal analysis service.');
    }

    return mapMultimodalMealResponse(response.data.data);
  },
};
