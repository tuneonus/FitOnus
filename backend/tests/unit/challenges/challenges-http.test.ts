import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler, notFoundHandler } from '../../../src/middleware/error-handler.js';
import { requestContext } from '../../../src/middleware/request-context.js';
import { createActor } from '../../../src/shared/auth/actor.js';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { buildRouter } from '../../../src/shared/http/route.js';
import { createLogger } from '../../../src/shared/logging/logger.js';

import {
  createChallengesMemberController,
  type ChallengesMemberUseCases,
} from '../../../src/modules/challenges/interface/challenges.controller.js';
import {
  createChallengesAdminController,
  type ChallengesAdminUseCases,
} from '../../../src/modules/challenges/interface/admin-challenges.controller.js';
import {
  createChallengesMemberRoutes,
  createGamificationMemberRoutes,
} from '../../../src/modules/challenges/interface/challenges.routes.js';
import { createChallengesAdminRoutes } from '../../../src/modules/challenges/interface/admin-challenges.routes.js';

import {
  ChallengeNotFoundError,
  OccurrenceNotFoundError,
  RewardAlreadyClaimedError,
  DuplicateEnrollmentError,
  IneligibleForRewardError,
} from '../../../src/modules/challenges/domain/errors.js';

import type {
  ActiveChallengeItemView,
  BadgeView,
  ChallengeEnrollmentView,
  ChallengeOccurrenceView,
  ChallengeView,
  GamificationProfileView,
  PointsLedgerView,
} from '../../../src/modules/challenges/application/views.js';
import type { ClaimChallengeRewardResult } from '../../../src/modules/challenges/application/use-cases/claim-challenge-reward.js';

describe('Challenges & Gamification HTTP API', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const challengeId = '22222222-2222-4222-8222-222222222222';
  const occurrenceId = '33333333-3333-4333-8333-333333333333';
  const enrollmentId = '44444444-4444-4444-8444-444444444444';
  const badgeId = '55555555-5555-4555-8555-555555555555';
  const ledgerId = '66666666-6666-4666-8666-666666666666';

  const sampleChallengeView: ChallengeView = {
    id: challengeId,
    slug: 'weekly-run-50k',
    title: '50km Weekly Mileage',
    description: 'Log 50 kilometers of outdoor running in a week',
    cadence: 'weekly',
    category: 'workout',
    metricType: 'workout_count',
    targetValue: 5,
    rewardPoints: 200,
    rewardBadgeId: badgeId,
    status: 'published',
    autoEnroll: false,
    iconName: 'run',
    bannerColor: '#4CAF50',
    metadata: {},
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };

  const sampleOccurrenceView: ChallengeOccurrenceView = {
    id: occurrenceId,
    challengeId,
    occurrenceKey: 'weekly-run-50k:2026-W45',
    periodStart: '2026-11-02T00:00:00.000Z',
    periodEnd: '2026-11-08T23:59:59.999Z',
    status: 'active',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };

  const sampleEnrollmentView: ChallengeEnrollmentView = {
    id: enrollmentId,
    userId,
    occurrenceId,
    challengeId,
    status: 'in_progress',
    currentProgress: 25,
    targetValue: 50,
    progressRatio: 0.5,
    completedAt: null,
    claimedAt: null,
    lastEvaluatedAt: '2026-11-06T12:00:00.000Z',
    createdAt: '2026-11-02T10:00:00.000Z',
    updatedAt: '2026-11-06T12:00:00.000Z',
  };

  const sampleActiveChallengeItem: ActiveChallengeItemView = {
    challenge: sampleChallengeView,
    occurrence: sampleOccurrenceView,
    enrollment: sampleEnrollmentView,
    enrolled: true,
    canClaim: false,
  };

  const sampleClaimResult: ClaimChallengeRewardResult = {
    claimed: true,
    pointsAwarded: 200,
    badgeAwarded: true,
    newTotalPoints: 1200,
    newLevel: 3,
  };

  const sampleBadgeView: BadgeView = {
    id: badgeId,
    slug: '50k-runner',
    name: '50km Runner',
    description: 'Completed 50km in a single week',
    category: 'challenge',
    tier: 'gold',
    iconName: 'medal-gold',
    pointsValue: 200,
    isActive: true,
    earned: true,
    earnedAt: '2026-11-06T12:30:00.000Z',
  };

  const sampleGamificationProfileView: GamificationProfileView = {
    userId,
    totalPoints: 1200,
    currentLevel: 3,
    levelTitle: 'Silver Athlete',
    currentLevelMinPoints: 1000,
    nextLevelMinPoints: 2500,
    pointsToNextLevel: 1300,
    levelProgressRatio: 0.1333,
    badgesCount: 5,
    challengesWon: 3,
    updatedAt: '2026-11-06T12:30:00.000Z',
  };

  const samplePointsLedgerView: PointsLedgerView = {
    id: ledgerId,
    userId,
    points: 200,
    sourceType: 'challenge',
    sourceId: occurrenceId,
    description: 'Completed 50km Weekly Mileage',
    createdAt: '2026-11-06T12:30:00.000Z',
  };

  function createTestApp(options: {
    memberOverrides?: Partial<ChallengesMemberUseCases>;
    adminOverrides?: Partial<ChallengesAdminUseCases>;
    authenticated?: boolean;
    role?: 'member' | 'admin';
  } = {}) {
    const {
      memberOverrides = {},
      adminOverrides = {},
      authenticated = true,
      role = 'member',
    } = options;

    const memberUseCases: ChallengesMemberUseCases = {
      listActiveChallenges: { execute: vi.fn().mockResolvedValue({ challenges: [sampleActiveChallengeItem] }) } as any,
      getChallengeHistory: { execute: vi.fn().mockResolvedValue({ history: [sampleActiveChallengeItem] }) } as any,
      enrollChallenge: { execute: vi.fn().mockResolvedValue({ enrollment: sampleEnrollmentView }) } as any,
      evaluateChallengeProgress: { execute: vi.fn().mockResolvedValue({ enrollments: [sampleEnrollmentView] }) } as any,
      claimChallengeReward: { execute: vi.fn().mockResolvedValue(sampleClaimResult) } as any,
      getGamificationSummary: { execute: vi.fn().mockResolvedValue({ profile: sampleGamificationProfileView }) } as any,
      listUserBadges: { execute: vi.fn().mockResolvedValue({ badges: [sampleBadgeView] }) } as any,
      getPointsHistory: { execute: vi.fn().mockResolvedValue({ points: [samplePointsLedgerView] }) } as any,
      ...memberOverrides,
    };

    const adminUseCases: ChallengesAdminUseCases = {
      adminListChallenges: { execute: vi.fn().mockResolvedValue({ challenges: [sampleChallengeView] }) } as any,
      adminGetChallenge: { execute: vi.fn().mockResolvedValue({ challenge: sampleChallengeView }) } as any,
      adminCreateChallenge: { execute: vi.fn().mockResolvedValue({ challenge: sampleChallengeView }) } as any,
      adminUpdateChallenge: { execute: vi.fn().mockResolvedValue({ challenge: sampleChallengeView }) } as any,
      adminPublishChallenge: { execute: vi.fn().mockResolvedValue({ challenge: sampleChallengeView }) } as any,
      adminArchiveChallenge: { execute: vi.fn().mockResolvedValue({ challenge: sampleChallengeView }) } as any,
      ...adminOverrides,
    };

    const memberController = createChallengesMemberController(memberUseCases);
    const adminController = createChallengesAdminController(adminUseCases);

    const memberChallengesRoutes = createChallengesMemberRoutes('/api/v1/challenges', memberController);
    const memberGamificationRoutes = createGamificationMemberRoutes('/api/v1/gamification', memberController);
    const adminChallengesRoutes = createChallengesAdminRoutes('/api/v1/admin/challenges', adminController);

    const app = express();
    app.use(requestContext(createLogger({ level: 'silent', pretty: false })));
    app.use(express.json());

    const authenticate: express.RequestHandler = (req, _res, next) => {
      if (!authenticated) {
        throw new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication is required.');
      }
      req.actor = createActor({ userId, sessionId: 's1', role });
      next();
    };

    app.use(memberChallengesRoutes.basePath, buildRouter(memberChallengesRoutes.routes, { authenticate }));
    app.use(memberGamificationRoutes.basePath, buildRouter(memberGamificationRoutes.routes, { authenticate }));
    app.use(adminChallengesRoutes.basePath, buildRouter(adminChallengesRoutes.routes, { authenticate }));

    app.use(notFoundHandler);
    app.use(errorHandler);

    return { app, memberUseCases, adminUseCases };
  }

  // =========================================================================
  // 1. Authentication & Authorization Security Tests
  // =========================================================================
  describe('Authentication & Authorization', () => {
    it('rejects unauthenticated requests to member challenge endpoints with 401', async () => {
      const { app } = createTestApp({ authenticated: false });

      const endpoints = [
        { method: 'get', path: '/api/v1/challenges' },
        { method: 'get', path: '/api/v1/challenges/history' },
        { method: 'post', path: `/api/v1/challenges/${occurrenceId}/enroll` },
        { method: 'get', path: `/api/v1/challenges/${occurrenceId}/progress` },
        { method: 'post', path: `/api/v1/challenges/${occurrenceId}/claim` },
      ];

      for (const ep of endpoints) {
        const req = (request(app) as any)[ep.method](ep.path);
        const res = await req;
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('UNAUTHENTICATED');
      }
    });

    it('rejects unauthenticated requests to gamification endpoints with 401', async () => {
      const { app } = createTestApp({ authenticated: false });

      const endpoints = [
        { method: 'get', path: '/api/v1/gamification/summary' },
        { method: 'get', path: '/api/v1/gamification/badges' },
        { method: 'get', path: '/api/v1/gamification/points/history' },
      ];

      for (const ep of endpoints) {
        const res = await (request(app) as any)[ep.method](ep.path);
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('UNAUTHENTICATED');
      }
    });

    it('rejects unauthenticated requests to admin challenge endpoints with 401', async () => {
      const { app } = createTestApp({ authenticated: false });

      const endpoints = [
        { method: 'get', path: '/api/v1/admin/challenges' },
        { method: 'post', path: '/api/v1/admin/challenges', body: {} },
        { method: 'get', path: `/api/v1/admin/challenges/${challengeId}` },
        { method: 'patch', path: `/api/v1/admin/challenges/${challengeId}`, body: {} },
        { method: 'post', path: `/api/v1/admin/challenges/${challengeId}/publish` },
        { method: 'post', path: `/api/v1/admin/challenges/${challengeId}/archive` },
      ];

      for (const ep of endpoints) {
        const req = (request(app) as any)[ep.method](ep.path);
        if (ep.body) req.send(ep.body);
        const res = await req;
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('UNAUTHENTICATED');
      }
    });

    it('rejects member role accessing admin challenge endpoints with 403 Forbidden', async () => {
      const { app } = createTestApp({ authenticated: true, role: 'member' });

      const endpoints = [
        { method: 'get', path: '/api/v1/admin/challenges' },
        {
          method: 'post',
          path: '/api/v1/admin/challenges',
          body: {
            title: 'Test',
            description: 'Test',
            cadence: 'weekly',
            category: 'workouts',
            metricType: 'workout_count',
            targetValue: 5,
            rewardPoints: 100,
          },
        },
        { method: 'get', path: `/api/v1/admin/challenges/${challengeId}` },
        { method: 'patch', path: `/api/v1/admin/challenges/${challengeId}`, body: { title: 'New' } },
        { method: 'post', path: `/api/v1/admin/challenges/${challengeId}/publish` },
        { method: 'post', path: `/api/v1/admin/challenges/${challengeId}/archive` },
      ];

      for (const ep of endpoints) {
        const req = (request(app) as any)[ep.method](ep.path);
        if (ep.body) req.send(ep.body);
        const res = await req;
        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('FORBIDDEN');
      }
    });

    it('allows admin role to access admin challenge endpoints', async () => {
      const { app } = createTestApp({ authenticated: true, role: 'admin' });

      const res = await request(app).get('/api/v1/admin/challenges');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // =========================================================================
  // 2. Member Challenges Endpoints
  // =========================================================================
  describe('Member Challenges Endpoints', () => {
    it('GET /api/v1/challenges returns active challenges list with 200', async () => {
      const { app, memberUseCases } = createTestApp();

      const res = await request(app)
        .get('/api/v1/challenges')
        .query({ timezone: 'America/New_York' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].challenge.id).toBe(challengeId);
      expect(res.body.data[0].enrollment.id).toBe(enrollmentId);
      expect(memberUseCases.listActiveChallenges.execute).toHaveBeenCalledWith({
        userId,
        timezone: 'America/New_York',
      });
    });

    it('GET /api/v1/challenges/history returns challenge history with 200', async () => {
      const { app, memberUseCases } = createTestApp();

      const res = await request(app)
        .get('/api/v1/challenges/history')
        .query({ status: 'completed' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(memberUseCases.getChallengeHistory.execute).toHaveBeenCalledWith({
        userId,
        status: 'completed',
      });
    });

    it('GET /api/v1/challenges/history returns 400 on invalid status enum', async () => {
      const { app } = createTestApp();

      const res = await request(app)
        .get('/api/v1/challenges/history')
        .query({ status: 'invalid_status' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('POST /api/v1/challenges/:occurrenceId/enroll enrolls member with 201', async () => {
      const { app, memberUseCases } = createTestApp();

      const res = await request(app)
        .post(`/api/v1/challenges/${occurrenceId}/enroll`);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(enrollmentId);
      expect(res.body.data.occurrenceId).toBe(occurrenceId);
      expect(memberUseCases.enrollChallenge.execute).toHaveBeenCalledWith({
        userId,
        occurrenceId,
      });
    });

    it('POST /api/v1/challenges/:occurrenceId/enroll returns 400 on non-UUID occurrenceId', async () => {
      const { app } = createTestApp();

      const res = await request(app)
        .post('/api/v1/challenges/not-a-uuid/enroll');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('POST /api/v1/challenges/:occurrenceId/enroll returns 409 on duplicate enrollment', async () => {
      const { app } = createTestApp({
        memberOverrides: {
          enrollChallenge: {
            execute: vi.fn().mockRejectedValue(new DuplicateEnrollmentError(userId, occurrenceId)),
          } as any,
        },
      });

      const res = await request(app)
        .post(`/api/v1/challenges/${occurrenceId}/enroll`);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('POST /api/v1/challenges/:occurrenceId/enroll returns 404 when occurrence not found', async () => {
      const { app } = createTestApp({
        memberOverrides: {
          enrollChallenge: {
            execute: vi.fn().mockRejectedValue(new OccurrenceNotFoundError(occurrenceId)),
          } as any,
        },
      });

      const res = await request(app)
        .post(`/api/v1/challenges/${occurrenceId}/enroll`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('GET /api/v1/challenges/:occurrenceId/progress returns evaluated progress with 200', async () => {
      const { app, memberUseCases } = createTestApp();

      const res = await request(app)
        .get(`/api/v1/challenges/${occurrenceId}/progress`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.currentProgress).toBe(25);
      expect(res.body.data.progressRatio).toBe(0.5);
      expect(memberUseCases.evaluateChallengeProgress.execute).toHaveBeenCalledWith({
        userId,
        occurrenceId,
      });
    });

    it('GET /api/v1/challenges/:occurrenceId/progress returns 404 if enrollment not found', async () => {
      const { app } = createTestApp({
        memberOverrides: {
          evaluateChallengeProgress: {
            execute: vi.fn().mockResolvedValue({ enrollments: [] }),
          } as any,
        },
      });

      const res = await request(app)
        .get(`/api/v1/challenges/${occurrenceId}/progress`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('POST /api/v1/challenges/:occurrenceId/claim claims reward with 200', async () => {
      const { app, memberUseCases } = createTestApp();

      const res = await request(app)
        .post(`/api/v1/challenges/${occurrenceId}/claim`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.claimed).toBe(true);
      expect(res.body.data.pointsAwarded).toBe(200);
      expect(res.body.data.badgeAwarded).toBe(true);
      expect(res.body.data.newTotalPoints).toBe(1200);
      expect(memberUseCases.claimChallengeReward.execute).toHaveBeenCalledWith({
        userId,
        occurrenceId,
      });
    });

    it('POST /api/v1/challenges/:occurrenceId/claim returns 400 when ineligible', async () => {
      const { app } = createTestApp({
        memberOverrides: {
          claimChallengeReward: {
            execute: vi.fn().mockRejectedValue(new IneligibleForRewardError('Target not reached')),
          } as any,
        },
      });

      const res = await request(app)
        .post(`/api/v1/challenges/${occurrenceId}/claim`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });

    it('POST /api/v1/challenges/:occurrenceId/claim returns 409 when reward already claimed', async () => {
      const { app } = createTestApp({
        memberOverrides: {
          claimChallengeReward: {
            execute: vi.fn().mockRejectedValue(new RewardAlreadyClaimedError(occurrenceId)),
          } as any,
        },
      });

      const res = await request(app)
        .post(`/api/v1/challenges/${occurrenceId}/claim`);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  // =========================================================================
  // 3. Member Gamification Endpoints
  // =========================================================================
  describe('Gamification Endpoints', () => {
    it('GET /api/v1/gamification/summary returns user profile summary with 200', async () => {
      const { app, memberUseCases } = createTestApp();

      const res = await request(app).get('/api/v1/gamification/summary');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.userId).toBe(userId);
      expect(res.body.data.totalPoints).toBe(1200);
      expect(res.body.data.currentLevel).toBe(3);
      expect(res.body.data.badgesCount).toBe(5);
      expect(res.body.data.challengesWon).toBe(3);
      expect(memberUseCases.getGamificationSummary.execute).toHaveBeenCalledWith({ userId });
    });

    it('GET /api/v1/gamification/badges returns badge catalog with 200', async () => {
      const { app, memberUseCases } = createTestApp();

      const res = await request(app).get('/api/v1/gamification/badges');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(badgeId);
      expect(res.body.data[0].slug).toBe('50k-runner');
      expect(res.body.data[0].earned).toBe(true);
      expect(memberUseCases.listUserBadges.execute).toHaveBeenCalledWith({ userId });
    });

    it('GET /api/v1/gamification/points/history returns points history with 200', async () => {
      const { app, memberUseCases } = createTestApp();

      const res = await request(app)
        .get('/api/v1/gamification/points/history')
        .query({ limit: 20 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].points).toBe(200);
      expect(res.body.data[0].sourceType).toBe('challenge');
      expect(memberUseCases.getPointsHistory.execute).toHaveBeenCalledWith({
        userId,
        limit: 20,
      });
    });

    it('GET /api/v1/gamification/points/history returns 400 on non-positive limit', async () => {
      const { app } = createTestApp();

      const res = await request(app)
        .get('/api/v1/gamification/points/history')
        .query({ limit: -5 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  // =========================================================================
  // 4. Admin Challenge Management Endpoints
  // =========================================================================
  describe('Admin Challenge Endpoints', () => {
    it('GET /api/v1/admin/challenges lists challenge definitions with 200', async () => {
      const { app, adminUseCases } = createTestApp({ authenticated: true, role: 'admin' });

      const res = await request(app)
        .get('/api/v1/admin/challenges')
        .query({ cadence: 'weekly', status: 'published' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(challengeId);
      expect(adminUseCases.adminListChallenges.execute).toHaveBeenCalledWith({
        cadence: 'weekly',
        status: 'published',
      });
    });

    it('GET /api/v1/admin/challenges returns 400 on invalid cadence query filter', async () => {
      const { app } = createTestApp({ authenticated: true, role: 'admin' });

      const res = await request(app)
        .get('/api/v1/admin/challenges')
        .query({ cadence: 'hourly' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('POST /api/v1/admin/challenges creates a challenge with 201', async () => {
      const { app, adminUseCases } = createTestApp({ authenticated: true, role: 'admin' });

      const res = await request(app)
        .post('/api/v1/admin/challenges')
        .send({
          slug: 'weekly-run-50k',
          title: '50km Weekly Mileage',
          description: 'Log 50 kilometers of outdoor running in a week',
          cadence: 'weekly',
          category: 'workout',
          metricType: 'workout_count',
          targetValue: 5,
          rewardPoints: 200,
          rewardBadgeId: badgeId,
          autoEnroll: false,
          iconName: 'run',
          bannerColor: '#4CAF50',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(challengeId);
      expect(res.body.data.targetValue).toBe(5);
      expect(adminUseCases.adminCreateChallenge.execute).toHaveBeenCalled();
    });

    it('POST /api/v1/admin/challenges returns 400 when targetValue <= 0', async () => {
      const { app } = createTestApp({ authenticated: true, role: 'admin' });

      const res = await request(app)
        .post('/api/v1/admin/challenges')
        .send({
          slug: 'zero-target',
          title: 'Zero Target Challenge',
          description: 'Invalid challenge target',
          cadence: 'weekly',
          category: 'workout',
          metricType: 'workout_count',
          targetValue: 0,
          rewardPoints: 100,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('POST /api/v1/admin/challenges returns 400 on invalid metricType', async () => {
      const { app } = createTestApp({ authenticated: true, role: 'admin' });

      const res = await request(app)
        .post('/api/v1/admin/challenges')
        .send({
          slug: 'bad-metric',
          title: 'Bad Metric',
          description: 'Invalid metric type',
          cadence: 'weekly',
          category: 'workout',
          metricType: 'swimming_laps',
          targetValue: 10,
          rewardPoints: 50,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('GET /api/v1/admin/challenges/:challengeId returns challenge details with 200', async () => {
      const { app, adminUseCases } = createTestApp({ authenticated: true, role: 'admin' });

      const res = await request(app).get(`/api/v1/admin/challenges/${challengeId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(challengeId);
      expect(adminUseCases.adminGetChallenge.execute).toHaveBeenCalledWith({ id: challengeId });
    });

    it('GET /api/v1/admin/challenges/:challengeId returns 404 when challenge not found', async () => {
      const { app } = createTestApp({
        authenticated: true,
        role: 'admin',
        adminOverrides: {
          adminGetChallenge: {
            execute: vi.fn().mockRejectedValue(new ChallengeNotFoundError(challengeId)),
          } as any,
        },
      });

      const res = await request(app).get(`/api/v1/admin/challenges/${challengeId}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('PATCH /api/v1/admin/challenges/:challengeId updates challenge with 200', async () => {
      const { app, adminUseCases } = createTestApp({ authenticated: true, role: 'admin' });

      const res = await request(app)
        .patch(`/api/v1/admin/challenges/${challengeId}`)
        .send({ title: 'Updated Title', description: 'Updated Description' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(adminUseCases.adminUpdateChallenge.execute).toHaveBeenCalledWith({
        id: challengeId,
        title: 'Updated Title',
        description: 'Updated Description',
      });
    });

    it('PATCH /api/v1/admin/challenges/:challengeId returns 409 if modifying rules while active enrollments exist', async () => {
      const { app } = createTestApp({
        authenticated: true,
        role: 'admin',
        adminOverrides: {
          adminUpdateChallenge: {
            execute: vi.fn().mockRejectedValue(
              new AppError(
                'conflict',
                'CONFLICT',
                'Cannot modify metricType or targetValue for a challenge with active enrollments.',
              ),
            ),
          } as any,
        },
      });

      const res = await request(app)
        .patch(`/api/v1/admin/challenges/${challengeId}`)
        .send({ targetValue: 75 });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('POST /api/v1/admin/challenges/:challengeId/publish publishes challenge with 200', async () => {
      const { app, adminUseCases } = createTestApp({ authenticated: true, role: 'admin' });

      const res = await request(app).post(`/api/v1/admin/challenges/${challengeId}/publish`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(adminUseCases.adminPublishChallenge.execute).toHaveBeenCalledWith({ id: challengeId });
    });

    it('POST /api/v1/admin/challenges/:challengeId/archive archives challenge with 200', async () => {
      const { app, adminUseCases } = createTestApp({ authenticated: true, role: 'admin' });

      const res = await request(app).post(`/api/v1/admin/challenges/${challengeId}/archive`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(adminUseCases.adminArchiveChallenge.execute).toHaveBeenCalledWith({ id: challengeId });
    });
  });
});
