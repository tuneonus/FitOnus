import { apiClient } from '@/services/api-client';
import type { FoodItem } from '@/features/nutrition/types/nutrition';

export interface VoiceDetectedFoodItem {
  id: string;
  name: string;
  brand?: string;
  serving: string;
  servingWeightG?: number;
  servingUnit?: string;
  servingSize?: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  confidence: 'high' | 'medium' | 'low';
  isAiEstimated: boolean;
}

export interface ParseVoiceMealParams {
  transcript?: string;
  audio?: string;
  mimeType?: string;
  lang?: string;
  mealType?: string;
}

export interface VoiceMealBackendResponse {
  transcript: string;
  detectedLanguage?: string | undefined;
  items: VoiceDetectedFoodItem[];
  confidence: 'high' | 'medium' | 'low';
  totalKcal: number;
  totalProteinGrams: number;
  totalCarbsGrams: number;
  totalFatGrams: number;
  unclearReason?: string | undefined;
  parsedAt?: string | undefined;
}

export interface VoiceMealParseResult {
  transcript: string;
  detectedLanguage?: string | undefined;
  items: FoodItem[];
  confidence: 'high' | 'medium' | 'low';
  totalKcal: number;
  totalProteinGrams: number;
  totalCarbsGrams: number;
  totalFatGrams: number;
  unclearReason?: string | undefined;
  parsedAt?: string | undefined;
}

export const VoiceMealApi = {
  parseVoiceMeal: async (params: ParseVoiceMealParams): Promise<VoiceMealParseResult> => {
    const response = await apiClient.post<{
      success: boolean;
      data: VoiceMealBackendResponse;
      message?: string;
    }>('/nutrition/voice-meal/parse', params, {
      timeout: 25_000,
    });

    if (!response.data?.data) {
      throw new Error('Invalid response received from voice meal parsing service.');
    }

    const data = response.data.data;
    const items: FoodItem[] = (data.items || []).map((item) => ({
      id: item.id,
      name: item.name,
      brand: item.brand,
      serving: item.serving,
      servingSize: item.servingSize,
      servingUnit: item.servingUnit,
      servingWeightG: item.servingWeightG,
      kcal: item.kcal,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      fiber: item.fiber || 0,
      estimated: true,
      confidence: item.confidence === 'high' ? 0.95 : item.confidence === 'medium' ? 0.8 : 0.6,
    }));

    return {
      transcript: data.transcript,
      detectedLanguage: data.detectedLanguage,
      items,
      confidence: data.confidence,
      totalKcal: data.totalKcal,
      totalProteinGrams: data.totalProteinGrams,
      totalCarbsGrams: data.totalCarbsGrams,
      totalFatGrams: data.totalFatGrams,
      unclearReason: data.unclearReason,
      parsedAt: data.parsedAt,
    };
  },
};
