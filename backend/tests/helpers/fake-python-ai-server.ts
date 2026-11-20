import { createServer, type IncomingHttpHeaders, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface CapturedRequest {
  method: string | undefined;
  url: string | undefined;
  headers: IncomingHttpHeaders;
  body: unknown;
}

export type FakeHandler = (request: CapturedRequest, response: ServerResponse) => void | Promise<void>;

export interface FakePythonServer {
  url: string;
  requests: CapturedRequest[];
  /** Replace the behavior for subsequent requests. */
  respond(handler: FakeHandler): void;
  close(): Promise<void>;
}

export const json = (response: ServerResponse, status: number, body: unknown): void => {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
};

/** A successful reply in the exact shape of ai-backend/src/onusfit_ai/features/coach/domain/chat.py `CoachChatResponse`. */
export const okCoachReply = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  outcome: 'ok',
  result: {
    text: 'Great consistency! Add 20 g of protein at dinner.',
    followUps: ['What should I eat?'],
    sources: ['Profile', "Today's Nutrition"],
    medicalNote: false,
    blocks: null,
  },
  usage: {
    model: 'gemini-3.5-flash-lite',
    isFallback: false,
    inputTokens: 900,
    outputTokens: 120,
    cachedTokens: 0,
    thinkingTokens: 30,
    totalTokens: 1050,
    durationMs: 1234,
  },
  traceId: 'trace-1',
  ...overrides,
});

/** A successful voice-meal reply in the exact shape of ai-backend/src/onusfit_ai/features/meals/domain/voice.py. */
export const okVoiceReply = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  outcome: 'ok',
  result: {
    transcript: 'rendu dosai, sambar',
    detectedLanguage: 'tanglish',
    items: [
      {
        id: 'voice-food-1700000000000-0',
        name: 'Dosa',
        brand: 'AI Voice Estimate',
        serving: '2 pieces · 160 g',
        servingWeightG: 160,
        servingUnit: 'piece',
        servingSize: 2,
        kcal: 260,
        protein: 6,
        carbs: 44,
        fat: 7,
        fiber: 2,
        confidence: 'high',
        isAiEstimated: true,
      },
    ],
    confidence: 'high',
    totalKcal: 260,
    totalProteinGrams: 6,
    totalCarbsGrams: 44,
    totalFatGrams: 7,
    totalFiberGrams: 2,
    unclearReason: null,
    parsedAt: '2026-11-18T10:00:00.000Z',
  },
  usage: {
    model: 'gemini-3.5-flash-lite',
    isFallback: false,
    inputTokens: 700,
    outputTokens: 90,
    cachedTokens: 0,
    thinkingTokens: 10,
    totalTokens: 800,
    durationMs: 900,
  },
  traceId: 'trace-voice-1',
  ...overrides,
});

/** A successful meal photo reply in the shape of ai-backend/src/onusfit_ai/features/meals/domain/photo.py. */
export const okMealPhotoReply = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  outcome: 'ok',
  result: {
    isFood: true,
    summary: 'Dosa with sambar',
    items: [
      {
        id: 'ai-food-1700000000000-0',
        name: 'Dosa',
        brand: 'AI Estimate',
        serving: '2 pieces',
        servingWeightG: 160,
        servingUnit: 'piece',
        servingSize: 2,
        kcal: 260,
        protein: 6,
        carbs: 44,
        fat: 7,
        fiber: 2,
        confidence: 'high',
        isAiEstimated: true,
      },
    ],
    overallConfidence: 0.9,
    totalKcal: 260,
    totalProteinGrams: 6,
    totalCarbsGrams: 44,
    totalFatGrams: 7,
    totalFiberGrams: 2,
    unclearReason: null,
    analyzedAt: '2026-11-19T10:00:00.000Z',
  },
  usage: {
    model: 'gemini-3.5-flash-lite',
    isFallback: false,
    inputTokens: 1200,
    outputTokens: 150,
    cachedTokens: 0,
    thinkingTokens: 20,
    totalTokens: 1370,
    durationMs: 2100,
  },
  traceId: 'trace-photo-1',
  ...overrides,
});

/** A successful coach insights reply in the shape of ai-backend/src/onusfit_ai/features/coach/domain/insights.py. */
export const okInsightsReply = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  outcome: 'ok',
  result: {
    greeting: 'Good morning Karthik!',
    recommendation: 'Target Leg Day today.',
    insights: [
      {
        id: 'ins-1',
        title: 'Workout Consistency',
        description: 'You trained twice recently. Ready for Leg Day?',
        category: 'workout',
        priority: 'high',
        severity: 'positive',
        action: 'View Workout',
        question: 'What is scheduled for Leg Day?',
        evidence: ['Upper Body Push logged'],
        confidence: 'high',
        requiresDevice: false,
      },
    ],
    generatedAt: '2026-11-19T10:00:00.000Z',
    hasSufficientData: true,
  },
  usage: {
    model: 'gemini-3.5-flash-lite',
    isFallback: false,
    inputTokens: 800,
    outputTokens: 200,
    cachedTokens: 0,
    thinkingTokens: 15,
    totalTokens: 1015,
    durationMs: 1800,
  },
  traceId: 'trace-insights-1',
  ...overrides,
});

/** A successful transcription reply in the shape of ai-backend/src/onusfit_ai/features/speech/application/contracts.py. */
export const okTranscribeReply = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  outcome: 'ok',
  result: { transcript: 'inniku leg workout mudichiten', detectedLanguage: 'tanglish' },
  usage: {
    model: 'gemini-3.5-flash-lite',
    isFallback: false,
    inputTokens: 300,
    outputTokens: 30,
    cachedTokens: 0,
    thinkingTokens: 0,
    totalTokens: 330,
    durationMs: 800,
  },
  traceId: 'trace-stt-1',
  ...overrides,
});

export const pythonError = (code: string, message: string, extra: Record<string, unknown> = {}) => ({
  error: { code, message, dispatched: true, ...extra },
});

/** A real HTTP server on an ephemeral localhost port that records every request it receives. */
export async function startFakePythonServer(initial?: FakeHandler): Promise<FakePythonServer> {
  const requests: CapturedRequest[] = [];
  let handler: FakeHandler = initial ?? ((_req, res) => json(res, 200, okCoachReply()));

  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      let body: unknown = text;
      try {
        body = JSON.parse(text);
      } catch {
        /* keep raw text */
      }
      const captured: CapturedRequest = { method: req.method, url: req.url, headers: req.headers, body };
      requests.push(captured);
      void Promise.resolve(handler(captured, res));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    respond: (next) => {
      handler = next;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** A localhost URL where nothing is listening (connection refused). */
export async function closedPortUrl(): Promise<string> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return `http://127.0.0.1:${port}`;
}
