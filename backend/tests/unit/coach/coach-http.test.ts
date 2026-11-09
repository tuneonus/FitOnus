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

    const controller = createCoachController({
      chatWithCoach: mockUseCase,
      getCoachInsights: mockGetInsightsUseCase as any,
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

    return { app, mockUseCase, mockGetInsightsUseCase };
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
});

