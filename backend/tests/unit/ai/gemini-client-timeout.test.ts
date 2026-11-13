import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AiUsageGateService,
  CheckAndRecordAiQuotaUseCase,
  GeminiRuntimeService,
  type AppSettingsRepository,
  type GeminiConfigRecord,
} from '../../../src/modules/app-settings/index.js';
import { GeminiClient } from '../../../src/modules/coach/infrastructure/gemini-client.js';
import { STATUS_BY_KIND } from '../../../src/middleware/error-handler.js';
import { isAppError } from '../../../src/shared/errors/app-error.js';
import { InMemoryAiUsageStore } from '../../helpers/ai-usage-gate.js';

/**
 * Real GeminiClient + real GeminiRuntimeService + the real Google SDK. Only the network (`fetch`)
 * is replaced, by a stub that honours `AbortSignal` exactly like a real fetch does. That is what
 * proves the timeout signal actually reaches the HTTP layer (the production audit finding: the
 * signal was created but never passed to the request).
 */

const USER = '11111111-1111-4111-8111-111111111111';
const API_KEY = 'AIzaSy-SUPER-SECRET-KEY-DO-NOT-LEAK';
const MODEL = 'gemini-secret-model-name';
const SAFE_TIMEOUT_MESSAGE = 'AI request timed out. Please try again.';
const TIMEOUT_MS = 60;

const CONFIG: GeminiConfigRecord = {
  provider: 'gemini',
  encryptedApiKey: null,
  keyMask: null,
  previousEncryptedApiKey: null,
  previousKeyMask: null,
  defaultModel: MODEL,
  coachModel: MODEL,
  mealPhotoModel: MODEL,
  voiceMealModel: MODEL,
  workoutGeneratorModel: MODEL,
  version: 1,
  updatedBy: null,
  updatedAt: '2026-11-13T00:00:00.000Z',
};

const makeRepo = (config: GeminiConfigRecord = CONFIG) => {
  const recordGeminiUsage = vi.fn().mockResolvedValue(undefined);
  const repo = {
    getGeminiConfig: vi.fn().mockResolvedValue(config),
    getGeminiModelsWithPricing: vi.fn().mockResolvedValue([]),
    recordGeminiUsage,
  } as unknown as AppSettingsRepository;
  return { repo, recordGeminiUsage };
};

const runtimeClient = (fallbackApiKey: string | null = API_KEY) => {
  const { repo, recordGeminiUsage } = makeRepo();
  const runtimeService = new GeminiRuntimeService({
    repo,
    encryptionKey: 'k'.repeat(32),
    ...(fallbackApiKey ? { fallbackApiKey } : {}),
  });
  return { client: new GeminiClient({ runtimeService }), recordGeminiUsage };
};
const directClient = () => ({
  client: new GeminiClient({ apiKey: API_KEY, model: MODEL }),
  recordGeminiUsage: undefined,
});

interface FetchCall {
  url: string;
  signal: AbortSignal | undefined;
}

/** A provider that never answers; it only fails when the caller aborts, like a real fetch. */
function stubHangingProvider() {
  const calls: FetchCall[] = [];
  const fetchStub = vi.fn((input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), signal: init?.signal ?? undefined });
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(new DOMException('This operation was aborted', 'AbortError')),
      );
    });
  });
  vi.stubGlobal('fetch', fetchStub);
  return { fetchStub, calls };
}

const okBody = (text: string, usage = { promptTokenCount: 11, candidatesTokenCount: 7, totalTokenCount: 18 }) =>
  JSON.stringify({
    candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }],
    usageMetadata: usage,
  });
const jsonResponse = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'application/json' } });

type Client = GeminiClient;
const OPERATIONS: Record<string, (client: Client, timeoutMs?: number) => Promise<string>> = {
  text: (client, timeoutMs = TIMEOUT_MS) => client.generateText('hello coach', timeoutMs),
  image: (client, timeoutMs = TIMEOUT_MS) =>
    client.generateFromImage({ mimeType: 'image/jpeg', base64: 'aGVsbG8=' }, 'describe the meal', timeoutMs),
  audio: (client, timeoutMs = TIMEOUT_MS) =>
    client.generateFromAudio({ mimeType: 'audio/webm', base64: 'aGVsbG8=' }, 'transcribe the meal', timeoutMs),
};
const CONFIGURATIONS: Record<string, () => { client: Client; recordGeminiUsage: ReturnType<typeof vi.fn> | undefined }> = {
  'runtime service (production path)': runtimeClient,
  'direct API key (fallback path)': directClient,
};

const caught = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to be rejected');
};

beforeEach(() => {
  vi.useRealTimers();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each(Object.entries(CONFIGURATIONS))('Gemini timeout, %s', (_name, build) => {
  describe.each(Object.entries(OPERATIONS))('%s generation', (_op, call) => {
    it('stops waiting at the configured timeout and aborts the in-flight HTTP request', async () => {
      const { client } = build();
      const { calls } = stubHangingProvider();

      const startedAt = Date.now();
      const error = await caught(call(client));
      const elapsed = Date.now() - startedAt;

      expect(isAppError(error)).toBe(true);
      expect(elapsed).toBeGreaterThanOrEqual(TIMEOUT_MS - 10);
      expect(elapsed).toBeLessThan(1_500);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.signal).toBeDefined(); // the signal is really passed to the request
      expect(calls[0]!.signal!.aborted).toBe(true); // ...and the request was actually cancelled
    }, 4_000);

    it('returns the same safe, consistent 503 response for every operation', async () => {
      const { client } = build();
      stubHangingProvider();

      const error = (await caught(call(client))) as { kind: string; code: string; message: string; details?: unknown };

      expect(error).toMatchObject({ kind: 'unavailable', code: 'SERVICE_UNAVAILABLE', message: SAFE_TIMEOUT_MESSAGE });
      expect(STATUS_BY_KIND[error.kind as keyof typeof STATUS_BY_KIND]).toBe(503);
      expect(error.details).toBeUndefined();
    }, 4_000);

    it('never exposes the API key, model name, URL or provider internals', async () => {
      const { client } = build();
      stubHangingProvider();

      const error = (await caught(call(client))) as Error;
      const everything = JSON.stringify({ message: error.message, name: error.name, own: { ...error } }) + String(error.stack ?? '').split('\n')[0];

      for (const secret of [API_KEY, MODEL, 'generativelanguage', 'googleapis', 'AbortError', 'aborted']) {
        expect(everything).not.toContain(secret);
      }
    }, 4_000);

    it('sends exactly one provider request: no retry or duplicate after a timeout', async () => {
      const { client } = build();
      const { fetchStub } = stubHangingProvider();

      await caught(call(client));
      await new Promise((resolve) => setTimeout(resolve, 150)); // give any hidden retry time to fire

      expect(fetchStub).toHaveBeenCalledTimes(1);
    }, 4_000);

    it('does not time out a response that arrives in time, and leaves the request un-aborted', async () => {
      const { client } = build();
      const calls: FetchCall[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: unknown, init?: RequestInit) => {
          calls.push({ url: String(input), signal: init?.signal ?? undefined });
          return jsonResponse(okBody('all good'));
        }),
      );

      await expect(call(client, 5_000)).resolves.toBe('all good');
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(calls).toHaveLength(1);
      expect(calls[0]!.signal?.aborted).toBe(false);
    });

    it('maps an ordinary provider failure to a generic message without leaking provider text, and does not retry', async () => {
      const { client } = build();
      const fetchStub = vi.fn(async () =>
        jsonResponse(
          JSON.stringify({ error: { code: 500, message: `internal detail key=${API_KEY} model=${MODEL}`, status: 'INTERNAL' } }),
          500,
        ),
      );
      vi.stubGlobal('fetch', fetchStub);

      const error = (await caught(call(client, 5_000))) as Error;

      expect(isAppError(error)).toBe(true);
      expect(error.message).not.toContain(API_KEY);
      expect(error.message).not.toContain(MODEL);
      expect(error.message).not.toContain('internal detail');
      expect(fetchStub).toHaveBeenCalledTimes(1);
    });
  });
});

describe('Gemini timeout: telemetry and Step 1 quota semantics', () => {
  const buildGate = () => {
    const store = new InMemoryAiUsageStore();
    const settings = {
      getSettingByKey: async () => null,
      reserveAiUsage: (input: Parameters<InMemoryAiUsageStore['reserveAiUsage']>[0]) => store.reserveAiUsage(input),
      releaseAiUsage: (input: Parameters<InMemoryAiUsageStore['releaseAiUsage']>[0]) => store.releaseAiUsage(input),
    };
    return { store, gate: new AiUsageGateService(new CheckAndRecordAiQuotaUseCase(settings as never)) };
  };

  it('a timed-out provider call is recorded as `timeout` for the authenticated user and the right feature', async () => {
    const { client, recordGeminiUsage } = runtimeClient();
    const { gate } = buildGate();
    stubHangingProvider();

    await caught(gate.run({ userId: USER, action: 'coach_chat' }, () => client.generateText('hi', TIMEOUT_MS, 'coach_insights')));

    expect(recordGeminiUsage).toHaveBeenCalledTimes(1);
    expect(recordGeminiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER,
        feature: 'coach_insights',
        model: MODEL,
        status: 'timeout',
        errorCategory: 'TIMEOUT',
        totalTokens: 0,
        estimatedCostUsd: 0,
      }),
    );
    const { durationMs } = recordGeminiUsage.mock.calls[0]![0] as { durationMs: number };
    expect(durationMs).toBeGreaterThanOrEqual(TIMEOUT_MS - 10);
    expect(durationMs).toBeLessThan(1_500);
  }, 4_000);

  it('quota is still CONSUMED when the provider timed out after dispatch (no free retries)', async () => {
    const { client } = runtimeClient();
    const { gate, store } = buildGate();
    const { fetchStub } = stubHangingProvider();

    await caught(gate.run({ userId: USER, action: 'coach_chat' }, () => client.generateText('hi', TIMEOUT_MS)));

    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(store.actionCount(USER, 'coach_chat')).toBe(1);
  }, 4_000);

  it('quota is still REFUNDED when the request fails before the provider is called', async () => {
    const { client } = runtimeClient(null); // no API key anywhere
    const { gate, store } = buildGate();
    const fetchStub = vi.fn();
    vi.stubGlobal('fetch', fetchStub);

    const error = await caught(gate.run({ userId: USER, action: 'coach_chat' }, () => client.generateText('hi', TIMEOUT_MS)));

    expect(isAppError(error) && error.code === 'SERVICE_UNAVAILABLE').toBe(true);
    expect(fetchStub).not.toHaveBeenCalled();
    expect(store.actionCount(USER, 'coach_chat')).toBe(0);
  });

  it('a successful call is recorded as success with token usage, once', async () => {
    const { client, recordGeminiUsage } = runtimeClient();
    const { gate } = buildGate();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(okBody('fine'))));

    await gate.run({ userId: USER, action: 'coach_chat' }, () => client.generateText('hi', 5_000));

    expect(recordGeminiUsage).toHaveBeenCalledTimes(1);
    expect(recordGeminiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER,
        feature: 'coach_chat',
        status: 'success',
        inputTokens: 11,
        outputTokens: 7,
        totalTokens: 18,
        errorCategory: null,
      }),
    );
  });
});
