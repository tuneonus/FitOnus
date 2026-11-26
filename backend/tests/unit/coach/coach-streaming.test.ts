import { EventEmitter } from 'node:events';
import assert from 'node:assert/strict';
import express from 'express';
import { describe, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import type { AiUsageGate } from '../../../src/shared/ai/ai-usage.js';
import { NodeStreamMetricsCollector } from '../../../src/shared/ai/streaming-observability.js';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { errorHandler } from '../../../src/middleware/error-handler.js';
import { bindRequestCorrelation } from '../../../src/middleware/request-context.js';
import { buildRouter } from '../../../src/shared/http/route.js';
import type { Logger } from '../../../src/shared/logging/logger.js';
import type {
  ConversationRepository,
  MemoryExtractionJobQueue,
  MemoryRepository,
  UserContextRepository,
} from '../../../src/modules/coach/application/ports.js';
import type { CoachChatStreamService } from '../../../src/modules/coach/application/stream-ports.js';
import {
  StreamCoachChatUseCase,
  type StreamCoachChatCallbacks,
  type StreamCoachChatInput,
} from '../../../src/modules/coach/application/use-cases/stream-coach-chat.js';
import {
  formatSseEvent,
  sanitizeStreamError,
  type CoachStreamEvent,
} from '../../../src/modules/coach/domain/coach-stream.types.js';
import type { StoredChatMessage } from '../../../src/modules/coach/domain/coach-history.types.js';
import type { UserFitnessContext } from '../../../src/modules/coach/domain/coach.types.js';
import { PythonCoachStreamService } from '../../../src/modules/coach/infrastructure/python-coach-stream-service.js';
import { createCoachController } from '../../../src/modules/coach/interface/coach.controller.js';
import { createCoachRoutes } from '../../../src/modules/coach/interface/coach.routes.js';
import type { ChatWithCoachUseCase } from '../../../src/modules/coach/application/use-cases/chat-with-coach.js';
import type { GetCoachInsightsUseCase } from '../../../src/modules/coach/application/use-cases/get-coach-insights.js';

const USER_ID = 'user-stream-1';
const SECRET = 'test-secret-test-secret-test-secret-123';

function sampleContext(): UserFitnessContext {
  return {
    profile: {
      displayName: 'Asha',
      sex: 'female',
      age: 29,
      heightCm: 165,
      currentWeightKg: 62,
      targetWeightKg: 60,
      primaryGoal: 'strength',
      experienceLevel: 'intermediate',
      preferredWorkoutPlace: 'gym',
      workoutDaysPerWeek: 4,
      dietType: 'balanced',
      dailyCalorieTarget: 2000,
      dailyProteinGrams: 130,
    },
    todayNutrition: {
      caloriesConsumed: 1600,
      proteinGrams: 110,
      carbsGrams: 160,
      fatGrams: 50,
      waterIntakeMl: 2100,
      calorieTarget: 2000,
      proteinTarget: 130,
    },
    recentWorkouts: [],
    todayPlannedWorkout: null,
    activeGoals: [],
    latestWeightKg: 62,
  };
}

function makeFakeRepos() {
  const storedMessages: StoredChatMessage[] = [];
  const conversations = new Map<string, { id: string; title: string }>();

  const userContextRepo: UserContextRepository = {
    getUserFitnessContext: async () => sampleContext(),
  };

  const conversationRepo: ConversationRepository = {
    createConversation: async (_u, title) => {
      const id = '11111111-1111-4111-8111-111111111111';
      conversations.set(id, { id, title });
      return {
        id,
        title,
        preview: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    },
    listConversations: async () => ({ conversations: [], total: 0, page: 1, limit: 20 }),
    getConversation: async (_u, id) => {
      const c = conversations.get(id);
      if (!c) return null;
      return {
        id: c.id,
        title: c.title,
        preview: '',
        messages: storedMessages.filter((m) => m.conversationId === id),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    },
    updateConversation: async () => null,
    deleteConversation: async () => true,
    addMessage: async (_u, conversationId, msg) => {
      storedMessages.push({ ...msg, conversationId });
    },
    getMessages: async (_u, conversationId) =>
      storedMessages.filter((m) => m.conversationId === conversationId),
    setMessageFeedback: async () => true,
  };

  const memoryRepo: MemoryRepository = {
    listMemories: async () => ({ enabled: true, items: [], suggestions: [] }),
    getMemory: async () => null,
    createMemory: async () => {
      throw new Error('unused');
    },
    updateMemory: async () => null,
    deleteMemory: async () => true,
    updateMemoryStatus: async () => null,
    dismissSuggestion: async () => true,
    clearAll: async () => undefined,
    isMemoryEnabled: async () => true,
    setMemoryEnabled: async () => undefined,
    getActiveMemoriesForContext: async () => ['[GOALS]: Build upper body strength'],
    getDismissedTexts: async () => [],
  };

  const enqueued: Array<{ userId: string; conversationId: string; messageId: string }> = [];
  const jobQueue: MemoryExtractionJobQueue = {
    enqueue: async (userId, conversationId, messageId) => {
      enqueued.push({ userId, conversationId, messageId });
    },
    claimDue: async () => [],
    complete: async () => undefined,
    fail: async () => undefined,
    cancelForUser: async () => undefined,
    isJobCancelled: async () => false,
    pruneOldJobs: async () => 0,
  };

  return { userContextRepo, conversationRepo, memoryRepo, jobQueue, storedMessages, enqueued };
}

function makePassThroughGate(): { gate: AiUsageGate; calls: Array<{ userId: string; action: string }> } {
  const calls: Array<{ userId: string; action: string }> = [];
  const gate: AiUsageGate = {
    assertEnabled: async () => undefined,
    run: async (input, work) => {
      calls.push({ userId: input.userId, action: input.action });
      return work();
    },
  };
  return { gate, calls };
}

function makeTestApp(streamUseCase: StreamCoachChatUseCase, authed = true) {
  const controller = createCoachController({
    chatWithCoach: { execute: async () => ({ text: 'ok' }) } as unknown as ChatWithCoachUseCase,
    streamCoachChat: streamUseCase,
    getCoachInsights: {
      execute: async () => ({
        greeting: 'hi',
        recommendation: null,
        insights: [],
        generatedAt: '',
        hasSufficientData: false,
      }),
    } as unknown as GetCoachInsightsUseCase,
  });

  const group = createCoachRoutes('/api/v1/coach', controller);
  const authenticate = (req: Request, _res: Response, next: (err?: unknown) => void) => {
    if (authed) {
      req.actor = {
        userId: USER_ID,
        sessionId: 'sess-1',
        role: 'member',
        permissions: new Set(),
      };
    }
    next();
  };

  const app = express();
  app.use(bindRequestCorrelation);
  app.use(express.json());
  app.use(group.basePath, buildRouter(group.routes, { authenticate }));
  app.use(errorHandler);
  return app;
}

async function withServer(app: express.Express, run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('Phase 14: Node.js Coach Streaming Gateway & Policies', () => {
  it('1. rejects with 422 FEATURE_DISABLED when streaming flag is off without charging quota', async () => {
    const repos = makeFakeRepos();
    const { gate, calls } = makePassThroughGate();
    const metrics = new NodeStreamMetricsCollector();
    const streamService: CoachChatStreamService = {
      streamReply: vi.fn(async () => undefined),
    };
    const uc = new StreamCoachChatUseCase({
      userContextRepo: repos.userContextRepo,
      streamService,
      aiUsageGate: gate,
      streamingEnabled: false,
      conversationRepo: repos.conversationRepo,
      metrics,
    });
    const app = makeTestApp(uc);

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/v1/coach/chat/stream`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'How did I train this week?' }),
      });
      assert.equal(res.status, 422);
      const body = (await res.json()) as { error: { code: string } };
      assert.equal(body.error.code, 'FEATURE_DISABLED');
    });

    assert.equal(calls.length, 0);
    assert.equal(vi.mocked(streamService.streamReply).mock.calls.length, 0);
  });

  it('2. rejects unauthenticated callers with 401 UNAUTHENTICATED', async () => {
    const repos = makeFakeRepos();
    const { gate } = makePassThroughGate();
    const uc = new StreamCoachChatUseCase({
      userContextRepo: repos.userContextRepo,
      streamService: { streamReply: async () => undefined },
      aiUsageGate: gate,
      streamingEnabled: true,
    });
    const app = makeTestApp(uc, false);

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/v1/coach/chat/stream`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'hi' }),
      });
      assert.equal(res.status, 401);
      const body = (await res.json()) as { error: { code: string } };
      assert.equal(body.error.code, 'UNAUTHENTICATED');
    });
  });

  it('3. enforces daily quota gate before starting upstream stream', async () => {
    const repos = makeFakeRepos();
    const streamReply = vi.fn(async () => undefined);
    const gate: AiUsageGate = {
      assertEnabled: async () => undefined,
      run: async () => {
        throw new AppError('rate_limited', 'AI_QUOTA_EXCEEDED', 'Daily quota exceeded');
      },
    };
    const uc = new StreamCoachChatUseCase({
      userContextRepo: repos.userContextRepo,
      streamService: { streamReply },
      aiUsageGate: gate,
      streamingEnabled: true,
    });
    const app = makeTestApp(uc);

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/v1/coach/chat/stream`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'Check macros' }),
      });
      assert.equal(res.status, 429);
      const body = (await res.json()) as { error: { code: string } };
      assert.equal(body.error.code, 'AI_QUOTA_EXCEEDED');
    });
    assert.equal(streamReply.mock.calls.length, 0);
  });

  it('4. streams SSE frames end-to-end, persists messages once, and enqueues memory job', async () => {
    const repos = makeFakeRepos();
    const { gate, calls } = makePassThroughGate();
    const metrics = new NodeStreamMetricsCollector();
    const streamService: CoachChatStreamService = {
      streamReply: async (req, onEvent) => {
        await onEvent({
          type: 'start',
          traceId: req.requestId,
          seq: 1,
          model: 'gemini-3.5-flash-lite',
          mode: 'agent_langgraph',
          timestamp: '2026-11-25T10:00:00.000Z',
        });
        await onEvent({
          type: 'status',
          traceId: req.requestId,
          seq: 2,
          stage: 'tool_calling',
          message: 'Checking your recent workouts...',
          toolName: 'get_recent_workouts',
          timestamp: '2026-11-25T10:00:01.000Z',
        });
        await onEvent({
          type: 'delta',
          traceId: req.requestId,
          seq: 3,
          textDelta: 'Great consistency! ',
          timestamp: '2026-11-25T10:00:02.000Z',
        });
        await onEvent({
          type: 'delta',
          traceId: req.requestId,
          seq: 4,
          textDelta: 'Keep pushing on progressive overload.',
          timestamp: '2026-11-25T10:00:03.000Z',
        });
        await onEvent({
          type: 'complete',
          traceId: req.requestId,
          seq: 5,
          response: {
            text: 'Great consistency! Keep pushing on progressive overload.',
            followUps: ['Plan next workout'],
            sources: ['Workout history'],
            toolCalls: ['get_recent_workouts'],
          },
          timestamp: '2026-11-25T10:00:04.000Z',
        });
      },
    };
    const uc = new StreamCoachChatUseCase({
      userContextRepo: repos.userContextRepo,
      streamService,
      aiUsageGate: gate,
      streamingEnabled: true,
      conversationRepo: repos.conversationRepo,
      memoryRepo: repos.memoryRepo,
      jobQueue: repos.jobQueue,
      metrics,
    });
    const app = makeTestApp(uc);

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/v1/coach/chat/stream`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'How is my training?' }),
      });
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/);
      const rawText = await res.text();
      assert.ok(rawText.includes('event: start\n'));
      assert.ok(rawText.includes('event: status\n'));
      assert.ok(rawText.includes('event: delta\n'));
      assert.ok(rawText.includes('event: complete\n'));
      assert.ok(rawText.includes('Great consistency! '));
    });

    assert.equal(calls.length, 1);
    assert.equal(repos.storedMessages.length, 2);
    assert.equal(repos.storedMessages[0]?.role, 'user');
    assert.equal(repos.storedMessages[1]?.role, 'assistant');
    assert.equal(repos.enqueued.length, 1);
    assert.equal(metrics.snapshot().completedStreams, 1);
  });

  it('5. deduplicates concurrent in-flight and replays completed Idempotency-Key without double-charging', async () => {
    const repos = makeFakeRepos();
    const { gate, calls } = makePassThroughGate();
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((r) => {
      releaseFirst = r;
    });
    let callCount = 0;

    const streamService: CoachChatStreamService = {
      streamReply: async (req, onEvent) => {
        callCount += 1;
        await onEvent({
          type: 'start',
          traceId: req.requestId,
          seq: 1,
          model: 'gemini-3.5-flash-lite',
          mode: 'direct',
          timestamp: new Date().toISOString(),
        });
        await firstBlocked;
        await onEvent({
          type: 'delta',
          traceId: req.requestId,
          seq: 2,
          textDelta: 'Hydrate well.',
          timestamp: new Date().toISOString(),
        });
        await onEvent({
          type: 'complete',
          traceId: req.requestId,
          seq: 3,
          response: { text: 'Hydrate well.', followUps: [], sources: [] },
          timestamp: new Date().toISOString(),
        });
      },
    };
    const uc = new StreamCoachChatUseCase({
      userContextRepo: repos.userContextRepo,
      streamService,
      aiUsageGate: gate,
      streamingEnabled: true,
    });

    const events1: CoachStreamEvent[] = [];
    const p1 = uc.execute(
      { userId: USER_ID, message: 'Water check', idempotencyKey: 'idem-key-12345' },
      {
        onEvent: async (e) => {
          events1.push(e);
        },
      },
    );

    await new Promise((r) => setTimeout(r, 15));
    await assert.rejects(
      () =>
        uc.execute(
          { userId: USER_ID, message: 'Water check', idempotencyKey: 'idem-key-12345' },
          { onEvent: async () => undefined },
        ),
      (err: unknown) => err instanceof AppError && err.code === 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
    );

    releaseFirst();
    await p1;

    const eventsReplay: CoachStreamEvent[] = [];
    await uc.execute(
      { userId: USER_ID, message: 'Water check', idempotencyKey: 'idem-key-12345' },
      {
        onEvent: async (e) => {
          eventsReplay.push(e);
        },
      },
    );
    assert.equal(callCount, 1);
    assert.equal(calls.length, 1);
    assert.ok(eventsReplay.some((e) => e.type === 'complete' && e.response.text === 'Hydrate well.'));

    await assert.rejects(
      () =>
        uc.execute(
          { userId: USER_ID, message: 'Different prompt', idempotencyKey: 'idem-key-12345' },
          { onEvent: async () => undefined },
        ),
      (err: unknown) => err instanceof AppError && err.code === 'IDEMPOTENCY_KEY_REUSED',
    );
  });

  it('6. records Gemini usage once per Python stream and skips malformed SSE frames cleanly', async () => {
    const encoder = new TextEncoder();
    const recordExternalUsage = vi.fn(async () => undefined);
    const metrics = new NodeStreamMetricsCollector();

    const sseBody = [
      ': keepalive comment\n\n',
      'event: start\ndata: {"type":"start","traceId":"t-1","seq":1,"model":"gemini-3.5-flash-lite","mode":"direct","timestamp":"2026-11-25T10:00:00Z"}\n\n',
      'event: delta\ndata: {corrupted json\n\n',
      'event: delta\ndata: {"type":"delta","traceId":"t-1","seq":2,"textDelta":"Keep moving!","timestamp":"2026-11-25T10:00:01Z"}\n\n',
      'event: complete\ndata: {"type":"complete","traceId":"t-1","seq":3,"result":{"text":"Keep moving!","followUps":[],"sources":[]},"usage":{"model":"gemini-3.5-flash-lite","isFallback":false,"inputTokens":50,"outputTokens":10,"cachedTokens":0,"thinkingTokens":0,"totalTokens":60,"durationMs":120},"timestamp":"2026-11-25T10:00:02Z"}\n\n',
    ].join('');

    const fetchImpl: typeof fetch = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(sseBody));
            controller.close();
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );

    const svc = new PythonCoachStreamService({
      clientConfig: { baseUrl: 'http://127.0.0.1:8000', serviceSecret: SECRET, fetchImpl },
      resolveModels: async () => ({ primary: 'gemini-3.5-flash-lite', fallback: 'gemini-3.1-flash-lite' }),
      usageRecorder: { recordExternalUsage },
      pythonTimeoutMs: 10_000,
      metrics,
    });

    const received: CoachStreamEvent[] = [];
    await svc.streamReply(
      {
        requestId: 'req-1',
        userId: USER_ID,
        message: 'Motivate me',
        history: [],
        context: sampleContext(),
      },
      async (event) => {
        received.push(event);
      },
    );

    assert.equal(received.filter((e) => e.type === 'delta').length, 1);
    assert.equal(received.filter((e) => e.type === 'complete').length, 1);
    assert.equal(recordExternalUsage.mock.calls.length, 1);
    assert.equal(metrics.snapshot().malformedEvents, 1);
  });

  it('7. leaves quota refundable (dispatched=false) when Python rejects with 503 FEATURE_DISABLED', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          error: { code: 'FEATURE_DISABLED', message: 'Disabled', dispatched: false },
        }),
        { status: 503, headers: { 'content-type': 'application/json' } },
      );

    const svc = new PythonCoachStreamService({
      clientConfig: { baseUrl: 'http://127.0.0.1:8000', serviceSecret: SECRET, fetchImpl },
      resolveModels: async () => ({ primary: 'gemini-3.5-flash-lite', fallback: null }),
      pythonTimeoutMs: 10_000,
    });

    await assert.rejects(
      () =>
        svc.streamReply(
          {
            requestId: 'req-disabled',
            userId: USER_ID,
            message: 'Hi',
            history: [],
            context: sampleContext(),
          },
          async () => undefined,
        ),
      (err: unknown) => (err as { dispatched?: boolean }).dispatched === false,
    );
  });

  it('8. redacts leaked secrets, JWTs, internal URLs, and breakout tags from streamed deltas and errors', async () => {
    const repos = makeFakeRepos();
    const { gate } = makePassThroughGate();
    const emitted: CoachStreamEvent[] = [];

    const streamService: CoachChatStreamService = {
      streamReply: async (req, onEvent) => {
        await onEvent({
          type: 'delta',
          traceId: req.requestId,
          seq: 1,
          textDelta:
            'Key AIzaSyTestKey123456789012345 http://127.0.0.1:8000/secret <thought>hidden</thought> Safe advice.',
          timestamp: new Date().toISOString(),
        });
        await onEvent({
          type: 'error',
          traceId: req.requestId,
          seq: 2,
          code: 'PROVIDER_TIMEOUT',
          message: 'Traceback from http://127.0.0.1:8000 key sk-1234567890abcdef1234',
          retryable: true,
          timestamp: new Date().toISOString(),
        });
      },
    };
    const uc = new StreamCoachChatUseCase({
      userContextRepo: repos.userContextRepo,
      streamService,
      aiUsageGate: gate,
      streamingEnabled: true,
    });

    await uc.execute(
      { userId: USER_ID, message: 'Test safety' },
      {
        onEvent: async (e) => {
          emitted.push(e);
        },
      },
    );

    const delta = emitted.find((e) => e.type === 'delta');
    assert.ok(delta && delta.type === 'delta');
    assert.ok(!delta.textDelta.includes('AIzaSy'));
    assert.ok(!delta.textDelta.includes('127.0.0.1'));
    assert.ok(!delta.textDelta.includes('<thought>'));
    assert.ok(delta.textDelta.includes('Safe advice.'));

    const errEvt = emitted.find((e) => e.type === 'error');
    assert.ok(errEvt && errEvt.type === 'error');
    assert.equal(errEvt.message, 'AI request timed out. Please try again.');
    assert.equal(errEvt.retryable, true);
  });

  it('9. applies backpressure when awaiting response drain in controller', async () => {
    const res = new EventEmitter() as unknown as Response & EventEmitter;
    const chunks: string[] = [];
    let writeCalls = 0;
    let drainReleased = false;

    Object.assign(res, {
      writableEnded: false,
      writableFinished: false,
      destroyed: false,
      headersSent: false,
      status: () => res,
      setHeader: () => res,
      flushHeaders: () => {
        (res as { headersSent: boolean }).headersSent = true;
      },
      write: (chunk: string) => {
        chunks.push(chunk);
        writeCalls += 1;
        return writeCalls !== 1; // backpressure on first write
      },
      end: () => {
        (res as { writableEnded: boolean; writableFinished: boolean }).writableEnded = true;
        (res as { writableEnded: boolean; writableFinished: boolean }).writableFinished = true;
      },
    });

    const controller = createCoachController({
      chatWithCoach: { execute: async () => ({ text: 'ok' }) } as unknown as ChatWithCoachUseCase,
      streamCoachChat: {
        execute: async (_in: StreamCoachChatInput, cb: StreamCoachChatCallbacks) => {
          await cb.onEvent({
            type: 'delta',
            traceId: 't1',
            seq: 1,
            textDelta: 'One ',
            timestamp: new Date().toISOString(),
          });
          drainReleased = true;
          await cb.onEvent({
            type: 'delta',
            traceId: 't1',
            seq: 2,
            textDelta: 'Two',
            timestamp: new Date().toISOString(),
          });
        },
      } as unknown as StreamCoachChatUseCase,
      getCoachInsights: {
        execute: async () => ({
          greeting: 'hi',
          recommendation: null,
          insights: [],
          generatedAt: '',
          hasSufficientData: false,
        }),
      } as unknown as GetCoachInsightsUseCase,
    });

    const fakeReq = {
      actor: { userId: USER_ID, sessionId: 's', role: 'member', permissions: new Set() },
      validated: { body: { message: 'hello' }, headers: {} },
    } as unknown as Request;

    const pending = controller.streamChat(fakeReq, res);
    await new Promise((r) => setTimeout(r, 15));
    assert.equal(drainReleased, false);
    res.emit('drain');
    await pending;
    assert.equal(drainReleased, true);
    assert.equal(chunks.length, 2);
  });

  it('10. cancels upstream Python stream cleanly on abort and avoids persisting partial assistant messages', async () => {
    const repos = makeFakeRepos();
    const { gate } = makePassThroughGate();
    const metrics = new NodeStreamMetricsCollector();
    const ac = new AbortController();
    let abortedUpstream = false;

    const streamService: CoachChatStreamService = {
      streamReply: async (req, onEvent) => {
        req.signal?.addEventListener('abort', () => {
          abortedUpstream = true;
        });
        await onEvent({
          type: 'delta',
          traceId: req.requestId,
          seq: 1,
          textDelta: 'Halfway ',
          timestamp: new Date().toISOString(),
        });
        ac.abort();
        throw new Error('aborted');
      },
    };
    const uc = new StreamCoachChatUseCase({
      userContextRepo: repos.userContextRepo,
      streamService,
      aiUsageGate: gate,
      streamingEnabled: true,
      conversationRepo: repos.conversationRepo,
      metrics,
    });

    await uc.execute(
      { userId: USER_ID, message: 'Plan my day', signal: ac.signal },
      { onEvent: async () => undefined },
    );

    assert.equal(abortedUpstream, true);
    assert.equal(repos.storedMessages.filter((m) => m.role === 'assistant').length, 0);
    assert.equal(metrics.snapshot().cancelledStreams, 1);
  });

  it('11. never logs prompts, streamed text deltas, or secrets in telemetry events', async () => {
    const repos = makeFakeRepos();
    const { gate } = makePassThroughGate();
    const capturedLogs: Array<Record<string, unknown>> = [];
    const logger: Pick<Logger, 'info' | 'warn'> = {
      info: ((obj: unknown) => {
        if (obj && typeof obj === 'object') capturedLogs.push(obj as Record<string, unknown>);
      }) as Logger['info'],
      warn: ((obj: unknown) => {
        if (obj && typeof obj === 'object') capturedLogs.push(obj as Record<string, unknown>);
      }) as Logger['warn'],
    };

    const uc = new StreamCoachChatUseCase({
      userContextRepo: repos.userContextRepo,
      streamService: {
        streamReply: async (req, onEvent) => {
          await onEvent({
            type: 'delta',
            traceId: req.requestId,
            seq: 1,
            textDelta: 'SENSITIVE_DELTA_SECRET_TEXT',
            timestamp: new Date().toISOString(),
          });
          await onEvent({
            type: 'complete',
            traceId: req.requestId,
            seq: 2,
            response: { text: 'SENSITIVE_DELTA_SECRET_TEXT', followUps: [], sources: [] },
            timestamp: new Date().toISOString(),
          });
        },
      },
      aiUsageGate: gate,
      streamingEnabled: true,
      logger,
    });

    await uc.execute(
      { userId: USER_ID, message: 'SENSITIVE_PROMPT_SECRET_TEXT' },
      { onEvent: async () => undefined },
    );

    const serialized = JSON.stringify(capturedLogs);
    assert.ok(capturedLogs.length >= 3);
    assert.ok(!serialized.includes('SENSITIVE_PROMPT_SECRET_TEXT'));
    assert.ok(!serialized.includes('SENSITIVE_DELTA_SECRET_TEXT'));
    assert.ok(serialized.includes('ai.stream.completed'));
  });

  it('12. formats wire SSE events with id, event, data and sanitizes unknown error codes', () => {
    const frame = formatSseEvent({
      type: 'delta',
      traceId: 'trace-x',
      seq: 7,
      textDelta: 'hello',
      timestamp: '2026-11-25T10:00:00Z',
    });
    assert.equal(
      frame,
      'id: 7\nevent: delta\ndata: {"type":"delta","traceId":"trace-x","seq":7,"textDelta":"hello","timestamp":"2026-11-25T10:00:00Z"}\n\n',
    );
    const err = sanitizeStreamError('weird_db_stack_trace', 'SELECT * FROM users');
    assert.equal(err.code, 'INTERNAL_ERROR');
    assert.ok(!err.message.includes('SELECT'));
  });

  it('13. normalizes Python StreamDeltaEvent (`delta`/`sequence`) and StreamStartEvent wire frames', async () => {
    const encoder = new TextEncoder();
    const sseBody = [
      'id: 1\nevent: start\ndata: {"type":"start","traceId":"t-py","requestId":"r-py","model":"gemini-3.5-flash-lite","timestamp":"2026-11-25T10:00:00Z"}\n\n',
      'id: 2\nevent: delta\ndata: {"type":"delta","delta":"Python wire delta ","sequence":1,"traceId":"t-py"}\n\n',
      'id: 3\nevent: complete\ndata: {"type":"complete","outcome":"ok","result":{"text":"Python wire delta ","followUps":[],"sources":[]},"usage":{"model":"gemini-3.5-flash-lite","isFallback":false,"inputTokens":12,"outputTokens":4,"cachedTokens":0,"thinkingTokens":0,"totalTokens":16,"durationMs":40},"traceId":"t-py","partial":false}\n\n',
    ].join('');

    const fetchImpl: typeof fetch = async () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(encoder.encode(sseBody));
            c.close();
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );

    const svc = new PythonCoachStreamService({
      clientConfig: { baseUrl: 'http://127.0.0.1:8000', serviceSecret: SECRET, fetchImpl },
      resolveModels: async () => ({ primary: 'gemini-3.5-flash-lite', fallback: null }),
      pythonTimeoutMs: 10_000,
    });

    const events: CoachStreamEvent[] = [];
    await svc.streamReply(
      {
        requestId: 'r-py',
        userId: USER_ID,
        message: 'Check wire compat',
        history: [],
        context: sampleContext(),
      },
      async (e) => {
        events.push(e);
      },
    );

    assert.equal(events[0]?.type, 'start');
    assert.equal(events[1]?.type, 'delta');
    if (events[1]?.type === 'delta') {
      assert.equal(events[1].textDelta, 'Python wire delta ');
      assert.equal(events[1].seq, 1);
    }
    assert.equal(events[2]?.type, 'complete');
  });

  it('14. bridges Node streaming metrics, LLM usage, and trace spans into shared Phase 17 telemetry', async () => {
    const { defaultAiMetrics } = await import('../../../src/shared/ai/ai-metrics.js');
    const { defaultAiTracer } = await import('../../../src/shared/ai/ai-tracing.js');
    const { nodeStreamMetrics, NodeStreamTracker } =
      await import('../../../src/shared/ai/streaming-observability.js');

    defaultAiMetrics.reset();
    defaultAiTracer.clear();

    const tracker = new NodeStreamTracker({
      requestId: 'req-bridge-1',
      traceId: 'trace-bridge-1',
      userId: USER_ID,
      feature: 'coach_chat',
      metrics: nodeStreamMetrics,
    });
    tracker.markDelta(12);
    tracker.finish('completed');

    const encoder = new TextEncoder();
    const sseBody = [
      'id: 1\nevent: start\ndata: {"type":"start","traceId":"trace-bridge-1","model":"gemini-3.5-flash-lite","timestamp":"2026-11-25T10:00:00Z"}\n\n',
      'id: 2\nevent: delta\ndata: {"type":"delta","textDelta":"Hello ","seq":2,"traceId":"trace-bridge-1","timestamp":"2026-11-25T10:00:00Z"}\n\n',
      'id: 3\nevent: complete\ndata: {"type":"complete","outcome":"ok","result":{"text":"Hello ","followUps":[],"sources":[]},"usage":{"model":"gemini-3.5-flash-lite","isFallback":false,"inputTokens":15,"outputTokens":5,"cachedTokens":0,"thinkingTokens":0,"totalTokens":20,"durationMs":35},"traceId":"trace-bridge-1","partial":false}\n\n',
    ].join('');

    const fetchImpl: typeof fetch = async () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(encoder.encode(sseBody));
            c.close();
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );

    const svc = new PythonCoachStreamService({
      clientConfig: { baseUrl: 'http://127.0.0.1:8000', serviceSecret: SECRET, fetchImpl },
      resolveModels: async () => ({ primary: 'gemini-3.5-flash-lite', fallback: null }),
      pythonTimeoutMs: 10_000,
    });

    await svc.streamReply(
      {
        requestId: 'req-bridge-1',
        userId: USER_ID,
        message: 'Check bridge',
        history: [],
        context: sampleContext(),
      },
      async () => {},
    );

    const snap = defaultAiMetrics.getSnapshot();
    assert.ok(snap.streaming.totalStreams >= 1);
    assert.ok(snap.streaming.completedStreams >= 1);
    assert.ok(snap.streaming.ttft.count >= 1);
    assert.equal(snap.ai.byFeature.coach_chat?.requests, 1);
    assert.equal(snap.ai.byFeature.coach_chat?.totalTokens, 20);
    assert.ok(defaultAiTracer.recentSpans(undefined, 10).some((s) => s.operation === 'ai.python.stream'));
    defaultAiMetrics.reset();
    defaultAiTracer.clear();
  });
});
