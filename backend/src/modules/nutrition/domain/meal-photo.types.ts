export interface DetectedFoodItem {
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

export interface MealPhotoAnalysisResult {
  isFood: boolean;
  summary: string;
  items: DetectedFoodItem[];
  overallConfidence: number; // 0 to 1
  totalKcal: number;
  totalProteinGrams: number;
  totalCarbsGrams: number;
  totalFatGrams: number;
  totalFiberGrams: number;
  unclearReason?: string;
  analyzedAt: string;
}

export interface MealPhotoAnalysisInput {
  userId: string;
  imageBase64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic';
  mealType?: string;
  notes?: string;
}
