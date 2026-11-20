import { describe, expect, it } from 'vitest';
import {
  AUDIO_BODY_LIMIT,
  bodyLimitFor,
  JSON_ENVELOPE_BYTES,
  MAX_IMAGE_BASE64_CHARS,
  MEAL_PHOTO_BODY_LIMIT,
} from '../../../src/shared/ai/body-limits.js';
import { MAX_AUDIO_BASE64_CHARS } from '../../../src/shared/ai/audio-input.js';
import { createCoachRoutes } from '../../../src/modules/coach/interface/coach.routes.js';
import { createNutritionMemberRoutes } from '../../../src/modules/nutrition/interface/nutrition.routes.js';
import { analyzeMealPhotoRequest } from '../../../src/modules/nutrition/interface/meal-photo.schemas.js';
import { parseVoiceMealRequest } from '../../../src/modules/nutrition/interface/voice-meal.schemas.js';
import { transcribeAudioSchema } from '../../../src/modules/coach/interface/coach.schemas.js';
import type { AnyRouteSpec } from '../../../src/shared/http/route.js';

const MIB = 1024 * 1024;
/** `"11mb"` -> bytes, the way body-parser reads it (1 mb = 1024 * 1024). */
const bytesOf = (limit: string): number => Number(limit.replace(/mb$/, '')) * MIB;

describe('the request body limits of the AI routes that carry base64', () => {
  it('are derived from the caps the use cases enforce', () => {
    expect(MAX_IMAGE_BASE64_CHARS).toBe(10 * MIB);
    expect(MAX_AUDIO_BASE64_CHARS).toBe(15 * MIB);
    expect(MEAL_PHOTO_BODY_LIMIT).toBe('11mb');
    expect(AUDIO_BODY_LIMIT).toBe('16mb');
  });

  it('are the cap plus the JSON envelope rounded up to a whole mb, and never more', () => {
    for (const cap of [MAX_IMAGE_BASE64_CHARS, MAX_AUDIO_BASE64_CHARS, 1, 5 * MIB]) {
      const limit = bytesOf(bodyLimitFor(cap));
      expect(limit).toBeGreaterThanOrEqual(cap + JSON_ENVELOPE_BYTES);
      expect(limit).toBeLessThan(cap + JSON_ENVELOPE_BYTES + MIB);
    }
  });

  it('hold the largest request each route can legitimately receive', () => {
    const photo = JSON.stringify({
      image: 'A'.repeat(MAX_IMAGE_BASE64_CHARS),
      mimeType: 'image/jpeg',
      mealType: 'breakfast',
      notes: 'n'.repeat(250),
    });
    expect(Buffer.byteLength(photo)).toBeLessThan(bytesOf(MEAL_PHOTO_BODY_LIMIT));
    expect(analyzeMealPhotoRequest.body.safeParse(JSON.parse(photo)).success).toBe(true);

    const voice = JSON.stringify({
      audio: 'A'.repeat(MAX_AUDIO_BASE64_CHARS),
      transcript: 't'.repeat(2000),
      lang: 'l'.repeat(50),
      mealType: 'm'.repeat(50),
    });
    expect(Buffer.byteLength(voice)).toBeLessThan(bytesOf(AUDIO_BODY_LIMIT));
    expect(parseVoiceMealRequest.body.safeParse(JSON.parse(voice)).success).toBe(true);

    const transcribe = JSON.stringify({
      audio: { mimeType: 'audio/m4a', base64: 'A'.repeat(MAX_AUDIO_BASE64_CHARS) },
    });
    expect(Buffer.byteLength(transcribe)).toBeLessThan(bytesOf(AUDIO_BODY_LIMIT));
    expect(transcribeAudioSchema.safeParse(JSON.parse(transcribe)).success).toBe(true);
  });

  it('are far smaller than a limit that would admit anything much bigger than the caps', () => {
    expect(bytesOf(MEAL_PHOTO_BODY_LIMIT)).toBeLessThanOrEqual(12 * MIB);
    expect(bytesOf(AUDIO_BODY_LIMIT)).toBeLessThanOrEqual(17 * MIB);
  });
});

describe('which routes declare a bigger limit', () => {
  const stubs = new Proxy({}, { get: () => async () => ({ data: {} }) });
  const find = (routes: readonly AnyRouteSpec[], path: string) =>
    routes.find((spec) => spec.path === path && spec.method === 'post');

  const nutrition = createNutritionMemberRoutes('/api/v1/nutrition', stubs as never).routes;
  const coach = createCoachRoutes('/api/v1/coach', stubs as never, (_req, _res, next) => next()).routes;

  it('meal photo gets the photo limit', () => {
    expect(find(nutrition, '/meal-photo/analyze')?.bodyLimit).toBe(MEAL_PHOTO_BODY_LIMIT);
  });

  it('voice meal and transcription get the audio limit', () => {
    expect(find(nutrition, '/voice-meal/parse')?.bodyLimit).toBe(AUDIO_BODY_LIMIT);
    expect(find(coach, '/transcribe')?.bodyLimit).toBe(AUDIO_BODY_LIMIT);
  });

  it('every other route of both modules keeps the small global limit', () => {
    const declared = [...nutrition, ...coach]
      .filter((spec) => spec.bodyLimit !== undefined)
      .map((spec) => `${spec.method} ${spec.path}`);
    expect(declared.sort()).toEqual([
      'post /meal-photo/analyze',
      'post /transcribe',
      'post /voice-meal/parse',
    ]);
  });

  it('the coach chat route (text only, at most about 11 KB) is not one of them', () => {
    expect(find(coach, '/chat')?.bodyLimit).toBeUndefined();
  });
});
