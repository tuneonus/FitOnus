import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type {
  ParseVoiceMealParams,
  VoiceMealParseResult,
} from '../src/features/ai-coach/services/voice-meal-api';
import type { FoodItem } from '../src/features/nutrition/types/nutrition';

describe('Voice Meal AI Mobile Contracts & Data Mapping', () => {
  it('validates ParseVoiceMealParams supports both audio and transcript', () => {
    const transcriptParams: ParseVoiceMealParams = {
      transcript: 'Two rotis with dal and paneer',
      mealType: 'lunch',
      lang: 'en',
    };

    assert.equal(transcriptParams.transcript, 'Two rotis with dal and paneer');
    assert.equal(transcriptParams.mealType, 'lunch');

    const audioParams: ParseVoiceMealParams = {
      audio: 'base64EncodedAudioData',
      mimeType: 'audio/m4a',
      mealType: 'dinner',
    };

    assert.equal(audioParams.audio, 'base64EncodedAudioData');
    assert.equal(audioParams.mimeType, 'audio/m4a');
  });

  it('validates VoiceMealParseResult maps items with estimated flag and numeric confidence', () => {
    const mockFood: FoodItem = {
      id: 'voice-food-1',
      name: 'Whole Wheat Roti',
      brand: 'AI Voice Estimate',
      serving: '2 pieces · 80 g',
      kcal: 240,
      protein: 8,
      carbs: 40,
      fat: 6,
      fiber: 6,
      estimated: true,
      confidence: 0.95,
    };

    const result: VoiceMealParseResult = {
      transcript: 'Two rotis',
      detectedLanguage: 'en',
      items: [mockFood],
      confidence: 'high',
      totalKcal: 240,
      totalProteinGrams: 8,
      totalCarbsGrams: 40,
      totalFatGrams: 6,
      parsedAt: new Date().toISOString(),
    };

    assert.equal(result.transcript, 'Two rotis');
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.estimated, true);
    assert.equal(result.items[0]?.confidence, 0.95);
    assert.equal(result.totalKcal, 240);
  });

  it('handles Tanglish/Tamil meal voice results', () => {
    const dosaFood: FoodItem = {
      id: 'v-dosa-1',
      name: 'Plain Dosa',
      brand: 'AI Voice Estimate',
      serving: '2 pieces · 160 g',
      kcal: 266,
      protein: 6,
      carbs: 45,
      fat: 7,
      fiber: 2,
      estimated: true,
      confidence: 0.95,
    };

    const result: VoiceMealParseResult = {
      transcript: 'rendu dosai sambar konjam chutney',
      detectedLanguage: 'tanglish',
      items: [dosaFood],
      confidence: 'high',
      totalKcal: 266,
      totalProteinGrams: 6,
      totalCarbsGrams: 45,
      totalFatGrams: 7,
      parsedAt: new Date().toISOString(),
    };

    assert.equal(result.detectedLanguage, 'tanglish');
    assert.equal(result.items[0]?.name, 'Plain Dosa');
  });

  it('correctly handles unclear or empty speech result', () => {
    const result: VoiceMealParseResult = {
      transcript: '',
      detectedLanguage: 'en',
      items: [],
      confidence: 'low',
      totalKcal: 0,
      totalProteinGrams: 0,
      totalCarbsGrams: 0,
      totalFatGrams: 0,
      unclearReason: 'No speech was detected. Please speak closer to the mic.',
      parsedAt: new Date().toISOString(),
    };

    assert.equal(result.items.length, 0);
    assert.equal(result.confidence, 'low');
    assert.ok(result.unclearReason?.includes('No speech'));
  });
});
