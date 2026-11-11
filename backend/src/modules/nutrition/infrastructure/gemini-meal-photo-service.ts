import type { GeminiClient } from '../../coach/infrastructure/gemini-client.js';
import type {
  DetectedFoodItem,
  MealPhotoAnalysisResult,
} from '../domain/meal-photo.types.js';

export class GeminiMealPhotoService {
  constructor(private readonly client: GeminiClient) {}

  async analyzePhoto(
    image: { mimeType: string; base64: string },
    mealType?: string,
    notes?: string,
  ): Promise<MealPhotoAnalysisResult> {
    const prompt = this.buildPrompt(mealType, notes);
    const rawText = await this.client.generateFromImage(image, prompt, 25_000);
    return this.parseGeminiOutput(rawText);
  }

  private buildPrompt(mealType?: string, notes?: string): string {
    const contextNote = [
      mealType ? `Assumed meal type: ${mealType}` : null,
      notes ? `User notes: "${notes}"` : null,
    ]
      .filter(Boolean)
      .join(', ');

    return `You are OnusFit AI Meal Scanner — an expert nutritional biochemist, food recognition specialist, and dietitian.
Analyze the provided food photograph carefully.

${contextNote ? `ADDITIONAL CONTEXT: ${contextNote}\n` : ''}
INSTRUCTIONS:
1. Determine if the photograph contains recognizable food or beverages. If not (e.g. random objects, empty plate, pets, selfie, blurry unidentifiable image), set "isFood": false.
2. If food is present, identify every distinct food item on the plate/container.
3. For each detected food item:
   - Identify the standard food name (e.g., "Grilled Salmon Fillet", "Steamed Brown Rice", "Mixed Garden Salad").
   - Estimate the realistic portion weight in grams and volume (e.g. 150g, 1 cup, 2 slices).
   - Estimate calories (kcal), protein (g), carbohydrates (g), fat (g), and dietary fiber (g) based on standard USDA nutritional reference values.
   - Assign confidence: "high", "medium", or "low".
4. Mark every single value as an estimate based on visual analysis.
5. Provide a short 1-sentence summary of the meal.
6. Output STRICTLY VALID JSON ONLY without markdown backticks matching this schema:
{
  "isFood": true,
  "summary": "Grilled chicken breast with basmati rice and steamed broccoli",
  "confidence": "high",
  "unclearReason": null,
  "items": [
    {
      "name": "Grilled Chicken Breast",
      "portionDescription": "150g fillet",
      "servingWeightG": 150,
      "servingUnit": "fillet",
      "servingSize": 1,
      "calories": 248,
      "proteinG": 46.5,
      "carbsG": 0,
      "fatG": 5.4,
      "fiberG": 0,
      "confidence": "high"
    }
  ]
}

If no food is visible, return:
{
  "isFood": false,
  "summary": "No food detected",
  "confidence": "low",
  "unclearReason": "The image does not appear to contain recognizable food or beverage items.",
  "items": []
}`;
  }

  private parseGeminiOutput(rawText: string): MealPhotoAnalysisResult {
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    try {
      const parsed = JSON.parse(cleaned);
      const isFood = Boolean(parsed.isFood !== false && Array.isArray(parsed.items) && parsed.items.length > 0);

      if (!isFood) {
        return {
          isFood: false,
          summary: typeof parsed.summary === 'string' ? parsed.summary : 'No food recognized',
          items: [],
          overallConfidence: 0,
          totalKcal: 0,
          totalProteinGrams: 0,
          totalCarbsGrams: 0,
          totalFatGrams: 0,
          totalFiberGrams: 0,
          unclearReason: typeof parsed.unclearReason === 'string' ? parsed.unclearReason : 'No clear food detected in image.',
          analyzedAt: new Date().toISOString(),
        };
      }

      const items: DetectedFoodItem[] = parsed.items.map((it: any, idx: number) => {
        const kcal = Math.max(0, Math.round(Number(it.calories) || 0));
        const protein = Math.max(0, Math.round((Number(it.proteinG) || 0) * 10) / 10);
        const carbs = Math.max(0, Math.round((Number(it.carbsG) || 0) * 10) / 10);
        const fat = Math.max(0, Math.round((Number(it.fatG) || 0) * 10) / 10);
        const fiber = Math.max(0, Math.round((Number(it.fiberG) || 0) * 10) / 10);
        const confidence = ['high', 'medium', 'low'].includes(it.confidence) ? it.confidence : 'medium';

        return {
          id: `ai-food-${Date.now()}-${idx}`,
          name: String(it.name || `Food Item ${idx + 1}`),
          brand: 'AI Estimate',
          serving: String(it.portionDescription || `${it.servingWeightG || 100}g`),
          servingWeightG: Number(it.servingWeightG) || 100,
          servingUnit: String(it.servingUnit || 'serving'),
          servingSize: Number(it.servingSize) || 1,
          kcal,
          protein,
          carbs,
          fat,
          fiber,
          confidence,
          isAiEstimated: true,
        };
      });

      const totalKcal = items.reduce((sum, i) => sum + i.kcal, 0);
      const totalProteinGrams = Math.round(items.reduce((sum, i) => sum + i.protein, 0) * 10) / 10;
      const totalCarbsGrams = Math.round(items.reduce((sum, i) => sum + i.carbs, 0) * 10) / 10;
      const totalFatGrams = Math.round(items.reduce((sum, i) => sum + i.fat, 0) * 10) / 10;
      const totalFiberGrams = Math.round(items.reduce((sum, i) => sum + (i.fiber || 0), 0) * 10) / 10;

      const confScore = parsed.confidence === 'high' ? 0.9 : parsed.confidence === 'low' ? 0.5 : 0.75;

      return {
        isFood: true,
        summary: typeof parsed.summary === 'string' ? parsed.summary : 'Analyzed meal photo',
        items,
        overallConfidence: confScore,
        totalKcal,
        totalProteinGrams,
        totalCarbsGrams,
        totalFatGrams,
        totalFiberGrams,
        analyzedAt: new Date().toISOString(),
      };
    } catch {
      return {
        isFood: false,
        summary: 'Unable to parse food analysis',
        items: [],
        overallConfidence: 0,
        totalKcal: 0,
        totalProteinGrams: 0,
        totalCarbsGrams: 0,
        totalFatGrams: 0,
        totalFiberGrams: 0,
        unclearReason: 'AI response was not formatted correctly. Please try again.',
        analyzedAt: new Date().toISOString(),
      };
    }
  }
}
