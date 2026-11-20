import { apiClient } from '@/services/api-client';
import type { FoodItem, MealType } from '@/features/nutrition/types/nutrition';
import {
  mapDetectedFoodItem,
  type DetectedFoodItemDto,
} from '@/features/nutrition/utils/detected-food';

export interface AnalyzeMealPhotoParams {
  image: string; // base64 string
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | undefined;
  mealType?: MealType | undefined;
  notes?: string | undefined;
}

/** The backend's reply: items carry the model's high/medium/low word, not a number. */
export interface MealPhotoBackendResponse {
  isFood: boolean;
  summary: string;
  items: DetectedFoodItemDto[];
  overallConfidence: number;
  totalKcal: number;
  totalProteinGrams: number;
  totalCarbsGrams: number;
  totalFatGrams: number;
  totalFiberGrams?: number | undefined;
  unclearReason?: string | undefined;
  analyzedAt: string;
}

/** What the screens use: items already mapped to `FoodItem` (numeric confidence, estimate flag set). */
export interface MealPhotoAnalysisResult extends Omit<MealPhotoBackendResponse, 'items'> {
  items: FoodItem[];
}

export function mapMealPhotoResponse(data: MealPhotoBackendResponse): MealPhotoAnalysisResult {
  return { ...data, items: (data.items ?? []).map(mapDetectedFoodItem) };
}

export const MealPhotoApi = {
  analyzeMealPhoto: async (params: AnalyzeMealPhotoParams): Promise<MealPhotoAnalysisResult> => {
    const response = await apiClient.post<{
      success: boolean;
      data: MealPhotoBackendResponse;
      message?: string;
    }>(
      '/nutrition/meal-photo/analyze',
      {
        image: params.image,
        mimeType: params.mimeType || 'image/jpeg',
        mealType: params.mealType,
        notes: params.notes,
      },
      {
        timeout: 30_000,
      },
    );

    if (!response.data?.data) {
      throw new Error('Invalid response received from meal photo analysis service.');
    }

    return mapMealPhotoResponse(response.data.data);
  },
};
