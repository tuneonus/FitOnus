import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler, notFoundHandler } from '../../../src/middleware/error-handler.js';
import { requestContext } from '../../../src/middleware/request-context.js';
import { createActor } from '../../../src/shared/auth/actor.js';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { buildRouter } from '../../../src/shared/http/route.js';
import { createLogger } from '../../../src/shared/logging/logger.js';
import type { CoachResponse } from '../../../src/modules/coach/domain/coach.types.js';
import { createCoachController } from '../../../src/modules/coach/interface/coach.controller.js';
import { createCoachRoutes } from '../../../src/modules/coach/interface/coach.routes.js';
import { transcribeAudioSchema } from '../../../src/modules/coach/interface/coach.schemas.js';
import type { ChatWithCoachUseCase } from '../../../src/modules/coach/application/use-cases/chat-with-coach.js';

describe('Coach REST API HTTP Integration', () => {
  const userId = '11111111-1111-4111-8111-111111111111';

  const sampleCoachResponse: CoachResponse = {
    text: 'Good job on hitting 90g of protein today! You have 800 kcal left for dinner.',
    followUps: ['Can I eat biryani tonight?', 'What workout should I do?'],
    sources: ['Profile', "Today's Nutrition"],
    medicalNote: false,
  };

  function createTestApp(options: {
    authenticated?: boolean;
    actingUserId?: string;
    rateLimitBlocked?: boolean;
    useCaseError?: AppError;
  } = {}) {
    const {
      authenticated = true,
      actingUserId = userId,
      rateLimitBlocked = false,
      useCaseError,
    } = options;

    const mockUseCase = {
      execute: useCaseError
        ? vi.fn().mockRejectedValue(useCaseError)
        : vi.fn().mockResolvedValue(sampleCoachResponse),
    } as unknown as ChatWithCoachUseCase;

    const mockGetInsightsUseCase = {
      execute: vi.fn().mockResolvedValue({
        greeting: 'Hello Alex',
        recommendation: 'Train today',
        insights: [],
        generatedAt: new Date().toISOString(),
        hasSufficientData: true,
      }),
    };

    const mockManageConversations = {
      setFeedback: vi.fn().mockResolvedValue(undefined),
    };

    const mockTranscriber = {
      transcribe: vi.fn().mockResolvedValue({
        transcript: 'Today I ran 5 kilometers',
        detectedLanguage: 'en',
      }),
    };

    const controller = createCoachController({
      chatWithCoach: mockUseCase,
      getCoachInsights: mockGetInsightsUseCase as any,
      manageConversations: mockManageConversations as any,
      speechTranscriber: mockTranscriber as any,
    });

    const rateLimiter: express.RequestHandler = (_req, _res, next) => {
      if (rateLimitBlocked) {
        return next(new AppError('rate_limited', 'RATE_LIMITED', 'Too many requests. Try again later.'));
      }
      next();
    };

    const routesGroup = createCoachRoutes('/api/v1/coach', controller, rateLimiter);

    const app = express();
    app.use(requestContext(createLogger({ level: 'silent', pretty: false })));
    app.use(express.json());

    const authenticate: express.RequestHandler = (req, _res, next) => {
      if (!authenticated) {
        throw new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication is required.');
      }
      req.actor = createActor({ userId: actingUserId, sessionId: 's1', role: 'member' });
      next();
    };

    app.use(routesGroup.basePath, buildRouter(routesGroup.routes, { authenticate }));
    app.use(notFoundHandler);
    app.use(errorHandler);

    return { app, mockUseCase, mockGetInsightsUseCase, mockTranscriber };
  }

  it('rejects unauthenticated requests with 401', async () => {
    const { app } = createTestApp({ authenticated: false });
    const res = await request(app)
      .post('/api/v1/coach/chat')
      .send({ message: 'Hello coach' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects empty message with 400 validation error', async () => {
    const { app } = createTestApp({ authenticated: true });
    const res = await request(app)
      .post('/api/v1/coach/chat')
      .send({ message: '' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects message exceeding 1000 characters with 400 validation error', async () => {
    const { app } = createTestApp({ authenticated: true });
    const res = await request(app)
      .post('/api/v1/coach/chat')
      .send({ message: 'a'.repeat(1001) });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 200 and structured coach response when authenticated and valid', async () => {
    const { app, mockUseCase } = createTestApp({ authenticated: true });
    const res = await request(app)
      .post('/api/v1/coach/chat')
      .send({
        message: 'Can I have some biryani tonight?',
        timezone: 'Asia/Kolkata',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.text).toContain('Good job on hitting 90g of protein');
    expect(res.body.data.followUps).toHaveLength(2);
    expect(mockUseCase.execute).toHaveBeenCalledWith({
      userId,
      message: 'Can I have some biryani tonight?',
      timezone: 'Asia/Kolkata',
      history: undefined,
    });
  });

  it('returns 503 when AI service is unavailable or unconfigured', async () => {
    const { app } = createTestApp({
      authenticated: true,
      useCaseError: new AppError(
        'unavailable',
        'SERVICE_UNAVAILABLE',
        'AI coaching service is not configured. Please ensure GEMINI_API_KEY is set.',
      ),
    });

    const res = await request(app)
      .post('/api/v1/coach/chat')
      .send({ message: 'Hello' });

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(res.body.error.message).toContain('AI coaching service is not configured');
  });

  it('returns 429 when rate limit is exceeded', async () => {
    const { app } = createTestApp({
      authenticated: true,
      rateLimitBlocked: true,
    });

    const res = await request(app)
      .post('/api/v1/coach/chat')
      .send({ message: 'Hello again' });

    expect(res.status).toBe(429);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  describe('GET /api/v1/coach/insights', () => {
    it('returns 401 when request is not authenticated', async () => {
      const { app } = createTestApp({ authenticated: false });
      const res = await request(app).get('/api/v1/coach/insights');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with structured insights on successful request', async () => {
      const { app, mockGetInsightsUseCase } = createTestApp({ authenticated: true });
      const res = await request(app)
        .get('/api/v1/coach/insights')
        .query({ timezone: 'Asia/Kolkata', lang: 'en' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.greeting).toBe('Hello Alex');
      expect(res.body.data.hasSufficientData).toBe(true);
      expect(mockGetInsightsUseCase.execute).toHaveBeenCalledWith({
        userId,
        timezone: 'Asia/Kolkata',
        lang: 'en',
        forceRefresh: false,
      });
    });
  });

  describe('PATCH /api/v1/coach/messages/:id/feedback', () => {
    it('returns 401 when unauthenticated', async () => {
      const { app } = createTestApp({ authenticated: false });
      const res = await request(app)
        .patch('/api/v1/coach/messages/msg-123/feedback')
        .send({ feedback: 'like' });
      expect(res.status).toBe(401);
    });

    it('updates message feedback successfully', async () => {
      const { app } = createTestApp({ authenticated: true });
      const res = await request(app)
        .patch('/api/v1/coach/messages/msg-123/feedback')
        .send({ feedback: 'like' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.success).toBe(true);
    });

    it('rejects invalid feedback value with 400', async () => {
      const { app } = createTestApp({ authenticated: true });
      const res = await request(app)
        .patch('/api/v1/coach/messages/msg-123/feedback')
        .send({ feedback: 'invalid_rating' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/coach/transcribe', () => {
    it('returns 401 when unauthenticated', async () => {
      const { app } = createTestApp({ authenticated: false });
      const res = await request(app)
        .post('/api/v1/coach/transcribe')
        .send({ audio: { mimeType: 'audio/m4a', base64: 'AAAA' } });
      expect(res.status).toBe(401);
    });

    it('transcribes audio payload successfully (same response shape the app always received)', async () => {
      const { app, mockTranscriber } = createTestApp({ authenticated: true });
      const res = await request(app)
        .post('/api/v1/coach/transcribe')
        .send({ audio: { mimeType: 'audio/m4a', base64: 'AAAA' } });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({ transcript: 'Today I ran 5 kilometers', detectedLanguage: 'en' });
      // The user comes from the authenticated session, not from anything the client sent.
      expect(mockTranscriber.transcribe).toHaveBeenCalledWith(userId, { mimeType: 'audio/m4a', base64: 'AAAA' });
    });

    it.each(['audio/m4a', 'audio/x-m4a', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/aac', 'audio/3gpp'])(
      'accepts the supported format %s',
      async (mimeType) => {
        const { app } = createTestApp({ authenticated: true });
        const res = await request(app).post('/api/v1/coach/transcribe').send({ audio: { mimeType, base64: 'AAAA' } });
        expect(res.status).toBe(200);
      },
    );

    it.each(['audio/flac', 'image/png', 'text/plain', 'video/quicktime'])(
      'rejects the unsupported format %s with 400 before any AI call',
      async (mimeType) => {
        const { app, mockTranscriber } = createTestApp({ authenticated: true });
        const res = await request(app).post('/api/v1/coach/transcribe').send({ audio: { mimeType, base64: 'AAAA' } });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
        expect(mockTranscriber.transcribe).not.toHaveBeenCalled();
      },
    );

    it('refuses a 15 MB+ request before any AI call (body limit 413; the schema cap is a second line of defense)', async () => {
      const { app, mockTranscriber } = createTestApp({ authenticated: true });
      const res = await request(app)
        .post('/api/v1/coach/transcribe')
        .send({ audio: { mimeType: 'audio/m4a', base64: 'A'.repeat(15 * 1024 * 1024 + 1) } });
      expect([400, 413]).toContain(res.status);
      expect(mockTranscriber.transcribe).not.toHaveBeenCalled();
    });

    it('the request schema itself caps audio at 15 MB of base64 and requires a supported format', () => {
      const ok = { audio: { mimeType: 'audio/m4a', base64: 'A'.repeat(15 * 1024 * 1024) } };
      expect(transcribeAudioSchema.safeParse(ok).success).toBe(true);
      expect(
        transcribeAudioSchema.safeParse({ audio: { ...ok.audio, base64: ok.audio.base64 + 'A' } }).success,
      ).toBe(false);
      expect(transcribeAudioSchema.safeParse({ audio: { mimeType: 'audio/flac', base64: 'AAAA' } }).success).toBe(false);
    });

    it('rejects an empty clip with 400', async () => {
      const { app } = createTestApp({ authenticated: true });
      const res = await request(app).post('/api/v1/coach/transcribe').send({ audio: { mimeType: 'audio/m4a', base64: '' } });
      expect(res.status).toBe(400);
    });

    it('rejects missing audio payload with 400', async () => {
      const { app } = createTestApp({ authenticated: true });
      const res = await request(app)
        .post('/api/v1/coach/transcribe')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});

