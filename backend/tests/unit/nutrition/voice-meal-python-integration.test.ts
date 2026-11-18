import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AiUsageGateService,
  CheckAndRecordAiQuotaUseCase,
  type AppSettingsRepository,
} from '../../../src/modules/app-settings/index.js';
import { ParseVoiceMealUseCase } from '../../../src/modules/nutrition/application/use-cases/parse-voice-meal.js';
import { PythonVoiceMealService } from '../../../src/modules/nutrition/infrastructure/python-voice-meal-service.js';
import { voiceMealResponseSchema } from '../../../src/modules/nutrition/interface/voice-meal.schemas.js';
import { PythonAiClient } from '../../../src/shared/ai/python-ai-client.js';
import { isAppError } from '../../../src/shared/errors/app-error.js';
import { InMemoryAiUsageStore } from '../../helpers/ai-usage-gate.js';
import {
  closedPortUrl,
  json,
  okVoiceReply,
  pythonError,
  startFakePythonServer,
  type FakePythonServer,
} from '../../helpers/fake-python-ai-server.js';

/**
 * The real ParseVoiceMealUseCase and the real quota gate, with Python as the only AI backend.
 * Voice meal persists nothing, so the guarantees are: validation never charges or calls Python, exactly
 * one quota unit per admitted request, and refund-vs-consume follows whether Gemini may have been called.
 */

const SECRET = 'unit-test-secret-unit-test-secret-1234';
const USER = '11111111-1111-4111-8111-111111111111';
const LIMITS = { dailyGlobalLimit: 50, coachChatDailyLimit: 20, mealPhotoDailyLimit: 10, voiceMealDailyLimit: 10, workoutGeneratorDailyLimit: 10 };

class Settings {
  readonly store = new InMemoryAiUsageStore();
  voiceEnabled = true;
  async getSettingByKey(key: string) {
    return {
      key,
      value:
        key === 'features.flags'
          ? { aiCoach: true, mealPhotoScanner: true, voiceMealEntry: this.voiceEnabled, workoutGenerator: true }
          : LIMITS,
    };
  }
  reserveAiUsage = (input: Parameters<InMemoryAiUsageStore['reserveAiUsage']>[0]) => this.store.reserveAiUsage(input);
  releaseAiUsage = (input: Parameters<InMemoryAiUsageStore['releaseAiUsage']>[0]) => this.store.releaseAiUsage(input);
}

describe('Voice meal parsing served only by Python (full use case + quota gate)', () => {
  let server: FakePythonServer;
  let settings: Settings;

  const useCaseFor = (url: string, timeoutMs = 5_000) =>
    new ParseVoiceMealUseCase(
      new PythonVoiceMealService({
        client: new PythonAiClient({ baseUrl: url, serviceSecret: SECRET }),
        resolveModels: () => Promise.resolve({ primary: 'voice-primary', fallback: null }),
        pythonTimeoutMs: timeoutMs,
      }),
      new AiUsageGateService(new CheckAndRecordAiQuotaUseCase(settings as unknown as AppSettingsRepository)),
    );
  const parse = (input: Partial<Parameters<ParseVoiceMealUseCase['execute']>[0]> = {}, url = server.url, timeoutMs?: number) =>
    useCaseFor(url, timeoutMs).execute({ userId: USER, transcript: 'rendu dosai sambar', ...input });
  const failure = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);

  beforeEach(async () => {
    server = await startFakePythonServer((_r, res) => json(res, 200, okVoiceReply()));
    settings = new Settings();
  });
  afterEach(async () => {
    await server.close();
  });

  it('text path: one Python call, one quota unit, public response contract intact', async () => {
    const result = await parse();

    expect(() => voiceMealResponseSchema.parse(result)).not.toThrow();
    expect(result.items[0]).toMatchObject({ name: 'Dosa', kcal: 260, isAiEstimated: true });
    expect(server.requests).toHaveLength(1);
    expect(settings.store.actionCount(USER, 'voice_meal')).toBe(1);
    expect(settings.store.reserveCalls).toBe(1);
  });

  it('audio path: the clip travels to Python and is charged once', async () => {
    await parse({ transcript: undefined, audioBase64: 'AAECAw==', mimeType: 'audio/m4a' });

    expect(server.requests[0]!.body).toMatchObject({ audio: { mimeType: 'audio/m4a', base64: 'AAECAw==' } });
    expect(settings.store.actionCount(USER, 'voice_meal')).toBe(1);
  });

  it('audio plus transcript are both sent', async () => {
    await parse({ audioBase64: 'AAEC', mimeType: 'audio/webm' });
    expect(server.requests[0]!.body).toMatchObject({ transcript: 'rendu dosai sambar', audio: { mimeType: 'audio/webm' } });
  });

  it('Python unavailable: controlled 503 and the quota unit is refunded', async () => {
    const error = await failure(parse({}, await closedPortUrl()));
    expect(isAppError(error) && [error.kind, error.code]).toEqual(['unavailable', 'SERVICE_UNAVAILABLE']);
    expect(settings.store.actionCount(USER, 'voice_meal')).toBe(0);
    expect(settings.store.reserveCalls).toBe(1);
  });

  it('Python timeout: timeout error, unit stays consumed, no retry', async () => {
    server.respond(() => undefined);
    const error = await failure(parse({}, server.url, 100));
    expect(isAppError(error) && error.message).toBe('AI request timed out. Please try again.');
    expect(settings.store.actionCount(USER, 'voice_meal')).toBe(1);
    expect(server.requests).toHaveLength(1);
  });

  it('invalid service token (Python 401): controlled 503, unit refunded', async () => {
    server.respond((_r, res) => json(res, 401, pythonError('AUTH_INVALID_TOKEN', 'x', { dispatched: false })));
    const error = await failure(parse());
    expect(isAppError(error) && error.code).toBe('SERVICE_UNAVAILABLE');
    expect(settings.store.actionCount(USER, 'voice_meal')).toBe(0);
  });

  it('Gemini rate limit from Python: 429 with retry hint, unit consumed', async () => {
    server.respond((_r, res) => json(res, 429, pythonError('PROVIDER_RATE_LIMITED', 'Busy', { retryAfterSeconds: 25 })));
    const error = await failure(parse());
    expect(isAppError(error) && [error.kind, error.code, error.details]).toEqual([
      'rate_limited',
      'RATE_LIMITED',
      { retryAfterSeconds: 25 },
    ]);
    expect(settings.store.actionCount(USER, 'voice_meal')).toBe(1);
  });

  it('invalid Python response: controlled 503, unit consumed', async () => {
    server.respond((_r, res) => json(res, 200, { nope: true }));
    const error = await failure(parse());
    expect(isAppError(error) && error.code).toBe('SERVICE_UNAVAILABLE');
    expect(settings.store.actionCount(USER, 'voice_meal')).toBe(1);
  });

  describe('Node keeps validation and quota', () => {
    it.each([
      ['no transcript and no audio', { transcript: undefined }],
      ['blank transcript and no audio', { transcript: '   ' }],
      ['unsupported audio format', { transcript: undefined, audioBase64: 'AAEC', mimeType: 'audio/flac' }],
      ['audio over 15 MB', { transcript: undefined, audioBase64: 'A'.repeat(15 * 1024 * 1024 + 1), mimeType: 'audio/m4a' }],
    ])('%s: rejected before any charge or Python call', async (_name, input) => {
      const error = await failure(parse(input as never));
      expect(isAppError(error)).toBe(true);
      expect(settings.store.reserveCalls).toBe(0);
      expect(server.requests).toHaveLength(0);
    });

    it('a disabled feature never reaches Python', async () => {
      settings.voiceEnabled = false;
      const error = await failure(parse());
      expect(isAppError(error) && error.code).toBe('FEATURE_DISABLED');
      expect(server.requests).toHaveLength(0);
      expect(settings.store.totalCount(USER)).toBe(0);
    });

    it('an exhausted daily quota never reaches Python', async () => {
      settings.store.setCount(USER, 'voice_meal', 10);
      const error = await failure(parse());
      expect(isAppError(error) && error.code).toBe('AI_QUOTA_EXCEEDED');
      expect(server.requests).toHaveLength(0);
    });
  });
});
