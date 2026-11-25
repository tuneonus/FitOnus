import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { apiClient } from '../src/services/api-client';
import { useAuthStore } from '../src/features/auth/stores/auth-store';
import { queryClient } from '../src/providers/query-provider';
import { VoiceMealApi } from '../src/features/ai-coach/services/voice-meal-api';
import {
  VOICE_MAX_AUDIO_BASE64_CHARS,
  isAudioPayloadWithinLimit,
} from '../src/features/nutrition/utils/voice-recording-limit';
import { voiceMealResponseSchema } from '../../backend/src/modules/nutrition/interface/voice-meal.schemas';

const dosa = {
  id: 'voice-food-1700000000000-0',
  name: 'Plain Dosa',
  brand: 'AI Voice Estimate',
  serving: '2 pieces · 160 g',
  servingWeightG: 160,
  servingUnit: 'piece',
  servingSize: 2,
  kcal: 266,
  protein: 6,
  carbs: 45,
  fat: 7,
  fiber: 2,
  confidence: 'high' as const,
  isAiEstimated: true,
};

describe('VoiceMealApi (real client, canned HTTP)', () => {
  const original = apiClient.defaults.adapter;
  let posted: { url?: string; body: Record<string, unknown> } | null = null;

  beforeEach(() => {
    useAuthStore
      .getState()
      .setAuth({ id: 'u1', name: 'U', email: 'u@example.test', isEmailVerified: true });
    posted = null;
  });
  afterEach(() => {
    apiClient.defaults.adapter = original;
    useAuthStore.getState().clearAuth();
    queryClient.clear();
  });

  const reply = (data: unknown) => {
    apiClient.defaults.adapter = (async (config: { url?: string; data?: unknown }) => {
      posted = { url: config.url, body: JSON.parse(String(config.data)) };
      return { config, status: 200, statusText: 'OK', headers: {}, data: { success: true, data } };
    }) as never;
  };

  it('parses a Tanglish meal into estimated items with numeric confidence', async () => {
    // Checked against the backend's own response schema, so the test breaks if the contract moves.
    reply(
      voiceMealResponseSchema.parse({
        transcript: 'rendu dosai sambar konjam chutney',
        detectedLanguage: 'tanglish',
        items: [
          dosa,
          { ...dosa, id: 'voice-food-1700000000000-1', name: 'Sambar', confidence: 'low' },
        ],
        confidence: 'medium',
        totalKcal: 400,
        totalProteinGrams: 12,
        totalCarbsGrams: 60,
        totalFatGrams: 10,
        parsedAt: '2026-11-05T10:00:00.000Z',
      }),
    );

    const result = await VoiceMealApi.parseVoiceMeal({
      transcript: 'rendu dosai sambar konjam chutney',
      mealType: 'lunch',
    });

    assert.equal(posted!.url, '/nutrition/voice-meal/parse');
    assert.deepEqual(posted!.body, {
      transcript: 'rendu dosai sambar konjam chutney',
      mealType: 'lunch',
    });
    assert.equal(result.detectedLanguage, 'tanglish');
    assert.deepEqual(
      result.items.map((item) => item.confidence),
      [0.95, 0.6],
    );
    assert.ok(result.items.every((item) => item.estimated === true && item.foodId === null));
    assert.equal(result.items[0]!.brand, 'AI Voice Estimate');
    assert.equal(result.items[0]!.servingSize, 2);
  });

  it('sends recorded audio with its mime type', async () => {
    reply({
      transcript: 'two rotis',
      detectedLanguage: 'en',
      items: [],
      confidence: 'low',
      totalKcal: 0,
      totalProteinGrams: 0,
      totalCarbsGrams: 0,
      totalFatGrams: 0,
      parsedAt: '2026-11-05T10:00:00.000Z',
    });

    await VoiceMealApi.parseVoiceMeal({
      audio: 'YXVkaW8=',
      mimeType: 'audio/m4a',
      mealType: 'dinner',
    });

    assert.deepEqual(posted!.body, {
      audio: 'YXVkaW8=',
      mimeType: 'audio/m4a',
      mealType: 'dinner',
    });
  });

  it('an unclear recording yields no items and the reason', async () => {
    reply({
      transcript: '',
      detectedLanguage: 'en',
      items: [],
      confidence: 'low',
      unclearReason: 'No speech was detected. Please speak closer to the mic.',
      totalKcal: 0,
      totalProteinGrams: 0,
      totalCarbsGrams: 0,
      totalFatGrams: 0,
      parsedAt: '2026-11-05T10:00:00.000Z',
    });

    const result = await VoiceMealApi.parseVoiceMeal({ audio: 'YXVkaW8=', mimeType: 'audio/m4a' });

    assert.deepEqual(result.items, []);
    assert.match(result.unclearReason ?? '', /No speech/);
  });

  it('rejects an empty reply', async () => {
    apiClient.defaults.adapter = (async (config: unknown) => ({
      config,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { success: true },
    })) as never;

    await assert.rejects(VoiceMealApi.parseVoiceMeal({ transcript: 'x' }), /Invalid response/);
  });

  it('rejects empty or oversized audio payloads via client limit helper', () => {
    assert.equal(isAudioPayloadWithinLimit(''), false);
    assert.equal(isAudioPayloadWithinLimit('   '), false);
    assert.equal(isAudioPayloadWithinLimit('YXVkaW8='), true);
    assert.equal(isAudioPayloadWithinLimit('A'.repeat(VOICE_MAX_AUDIO_BASE64_CHARS + 1)), false);
  });
});
