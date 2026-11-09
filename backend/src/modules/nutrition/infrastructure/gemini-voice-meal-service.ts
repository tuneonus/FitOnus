import type { GeminiClient } from '../../coach/infrastructure/gemini-client.js';
import type { DetectedFoodItem } from '../domain/meal-photo.types.js';
import type { VoiceMealParseResult } from '../domain/voice-meal.types.js';

export class GeminiVoiceMealService {
  constructor(private readonly client: GeminiClient) {}

  async parseVoiceMeal(params: {
    transcript?: string;
    audio?: { mimeType: string; base64: string };
    lang?: string;
    mealType?: string;
  }): Promise<VoiceMealParseResult> {
    const prompt = this.buildPrompt(params.transcript, params.lang, params.mealType);

    let rawText = '';
    if (params.audio && params.audio.base64) {
      rawText = await this.client.generateFromAudio(params.audio, prompt, 25_000);
    } else if (params.transcript && params.transcript.trim()) {
      rawText = await this.client.generateText(prompt, 20_000, 'voice_meal');
    } else {
      return {
        transcript: '',
        detectedLanguage: 'en',
        items: [],
        confidence: 'low',
        totalKcal: 0,
        totalProteinGrams: 0,
        totalCarbsGrams: 0,
        totalFatGrams: 0,
        unclearReason: 'No speech or transcript was provided. Please speak or type what you ate.',
        parsedAt: new Date().toISOString(),
      };
    }

    return this.parseGeminiOutput(rawText, params.transcript);
  }

  private buildPrompt(transcript?: string, lang?: string, mealType?: string): string {
    const contextLines = [
      mealType ? `Assumed meal category: ${mealType}` : null,
      lang ? `Hinted language/dialect: ${lang}` : null,
      transcript ? `Spoken or input text: "${transcript}"` : null,
    ]
      .filter(Boolean)
      .join('\n');

    return `You are FitOnus AI Voice Meal Assistant — an expert dietary analyst, multilingual nutritionist, and food recognition AI.

TASK:
Analyze the meal described either in the audio or in the transcript text.
${contextLines ? `CONTEXT:\n${contextLines}\n` : ''}
LANGUAGE SUPPORT RULES:
1. Understand English, Tamil (தமிழ்), and Tanglish (Tamil written in English script or mixed Tamil-English, e.g. "rendu dosai sambar", "oru cup curd rice", "naalu idly with podi", "rendu chapathi and chicken gravy").
2. Accurately detect spoken/written quantities in any of these languages:
   - "one / oru / ondru" -> 1
   - "two / rendu / irandu" -> 2
   - "three / moonu / moondru" -> 3
   - "four / naalu / naangu" -> 4
   - "half / arai" -> 0.5
   - "cup / kinnam / bowl" -> standard 1 bowl portion (~200g)
   - "spoon / karandi" -> standard 1 tbsp (~15g)

3. Parse multi-item meals into discrete food items with realistic standard USDA / Indian Food Composition Tables nutritional values.
4. Estimate calories (kcal), protein (g), carbohydrates (g), fat (g), and dietary fiber (g).
5. If the audio/text contains no food items (e.g. background chatter, greeting, silence, non-food statement), set "items": [] and explain in "unclearReason".
6. Output STRICTLY VALID JSON ONLY without markdown backticks matching this schema:
{
  "transcript": "Transcribed or confirmed speech text in clear English or original script",
  "detectedLanguage": "en | ta | tanglish",
  "confidence": "high | medium | low",
  "unclearReason": null,
  "items": [
    {
      "name": "Standard Food Name",
      "portionDescription": "e.g. 2 pieces · 160 g or 1 bowl · 200 g",
      "servingWeightG": 160,
      "servingUnit": "piece",
      "servingSize": 2,
      "calories": 260,
      "proteinG": 6,
      "carbsG": 44,
      "fatG": 7,
      "fiberG": 2,
      "confidence": "high"
    }
  ]
}

If no clear food description is found:
{
  "transcript": "",
  "detectedLanguage": "en",
  "confidence": "low",
  "unclearReason": "Could not identify any food items. Please say what you ate, e.g. 'two rotis with dal'.",
  "items": []
}`;
  }

  private parseGeminiOutput(rawText: string, fallbackTranscript?: string): VoiceMealParseResult {
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    try {
      const parsed = JSON.parse(cleaned);
      const transcript = String(parsed.transcript || fallbackTranscript || '').trim();
      const detectedLanguage = String(parsed.detectedLanguage || 'en');
      const hasItems = Array.isArray(parsed.items) && parsed.items.length > 0;

      if (!hasItems) {
        return {
          transcript,
          detectedLanguage,
          items: [],
          confidence: 'low',
          totalKcal: 0,
          totalProteinGrams: 0,
          totalCarbsGrams: 0,
          totalFatGrams: 0,
          totalFiberGrams: 0,
          unclearReason: typeof parsed.unclearReason === 'string' ? parsed.unclearReason : 'No food recognized from voice entry.',
          parsedAt: new Date().toISOString(),
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
          id: `voice-food-${Date.now()}-${idx}`,
          name: String(it.name || `Food Item ${idx + 1}`),
          brand: 'AI Voice Estimate',
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
      const confidence = ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium';

      return {
        transcript,
        detectedLanguage,
        items,
        confidence,
        totalKcal,
        totalProteinGrams,
        totalCarbsGrams,
        totalFatGrams,
        totalFiberGrams,
        unclearReason: parsed.unclearReason || undefined,
        parsedAt: new Date().toISOString(),
      };
    } catch {
      return {
        transcript: fallbackTranscript || '',
        detectedLanguage: 'en',
        items: [],
        confidence: 'low',
        totalKcal: 0,
        totalProteinGrams: 0,
        totalCarbsGrams: 0,
        totalFatGrams: 0,
        totalFiberGrams: 0,
        unclearReason: 'AI response was not formatted correctly. Please try again.',
        parsedAt: new Date().toISOString(),
      };
    }
  }
}
