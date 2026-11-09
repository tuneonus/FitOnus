import { apiClient } from '@/services/api-client';
import type { FoodItem, MealType } from '@/features/nutrition/types/nutrition';

export interface AnalyzeMealPhotoParams {
  image: string; // base64 string
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | undefined;
  mealType?: MealType | undefined;
  notes?: string | undefined;
}

export interface MealPhotoAnalysisResult {
  isFood: boolean;
  summary: string;
  items: FoodItem[];
  overallConfidence: number;
  totalKcal: number;
  totalProteinGrams: number;
  totalCarbsGrams: number;
  totalFatGrams: number;
  totalFiberGrams?: number | undefined;
  unclearReason?: string | undefined;
  analyzedAt: string;
}

export const MealPhotoApi = {
  analyzeMealPhoto: async (params: AnalyzeMealPhotoParams): Promise<MealPhotoAnalysisResult> => {
    const response = await apiClient.post<{
      success: boolean;
      data: MealPhotoAnalysisResult;
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

    return response.data.data;
  },
};


