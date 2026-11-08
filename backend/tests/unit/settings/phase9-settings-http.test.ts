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
  createProfileController,
  type ProfileUseCases,
} from '../../../src/modules/profile/interface/profile.controller.js';
import { createProfileRoutes } from '../../../src/modules/profile/interface/profile.routes.js';
import {
  createUsersController,
  type UsersUseCases,
} from '../../../src/modules/users/interface/users.controller.js';
import { createUsersRoutes } from '../../../src/modules/users/interface/users.routes.js';
import { UserSettings } from '../../../src/modules/profile/domain/user-settings.js';
import type { UserSettingsView } from '../../../src/modules/profile/application/profile-view.js';

describe('Phase 9.2: Settings, Preferences & Secure Account Deletion HTTP API', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const otherUserId = '22222222-2222-4222-8222-222222222222';

  const defaultSettingsView: UserSettingsView = {
    userId,
    themeMode: 'system',
    unitSystem: 'metric',
    healthConnectEnabled: false,
    smartwatchConnected: false,
    notificationsEnabled: true,
    language: 'en',
    privacyAnalytics: true,
    privacyPhotoRetention: true,
    privacyCoachSharing: false,
    notificationSchedule: {},
    updatedAt: '2026-11-07T00:00:00.000Z',
  };

  function createTestApp(options?: {
    profileOverrides?: Partial<ProfileUseCases>;
    usersOverrides?: Partial<UsersUseCases>;
    authenticated?: boolean;
    actorUserId?: string;
  }) {
    const authenticated = options?.authenticated ?? true;
    const currentUserId = options?.actorUserId ?? userId;

    const profileUseCases: ProfileUseCases = {
      getProfile: { execute: vi.fn() } as any,
      updateProfile: { execute: vi.fn() } as any,
      saveOnboardingStep: { execute: vi.fn() } as any,
      completeOnboarding: { execute: vi.fn() } as any,
      getSettings: { execute: vi.fn().mockResolvedValue(defaultSettingsView) } as any,
      updateSettings: {
        execute: vi.fn().mockImplementation(async (_actor, patch) => ({
          ...defaultSettingsView,
          ...patch,
          updatedAt: new Date().toISOString(),
        })),
      } as any,
      ...options?.profileOverrides,
    };

    const usersUseCases: UsersUseCases = {
      createUser: { execute: vi.fn() } as any,
      getUser: { execute: vi.fn() } as any,
      listUsers: { execute: vi.fn() } as any,
      updateProfile: { execute: vi.fn() } as any,
      changeStatus: { execute: vi.fn() } as any,
      deleteAccount: {
        execute: vi.fn().mockImplementation(async (actor, input) => {
          if (input.password !== 'correct-password') {
            throw new AppError('unprocessable', 'INVALID_CREDENTIALS', 'The password is incorrect.');
          }
          return { deletedUserId: actor.userId };
        }),
      } as any,
      ...options?.usersOverrides,
    };

    const profileController = createProfileController(profileUseCases);
    const profileGroup = createProfileRoutes('/api/v1/profile', profileController);

    const usersController = createUsersController(usersUseCases);
    const usersGroup = createUsersRoutes('/api/v1/users', usersController);

    const app = express();
    app.use(requestContext(createLogger({ level: 'silent', pretty: false })));
    app.use(express.json());

    const authenticate: express.RequestHandler = (req, _res, next) => {
      if (!authenticated) {
        throw new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication is required.');
      }
      req.actor = createActor({ userId: currentUserId, sessionId: 's1', role: 'member' });
      next();
    };

    app.use(profileGroup.basePath, buildRouter(profileGroup.routes, { authenticate }));
    app.use(usersGroup.basePath, buildRouter(usersGroup.routes, { authenticate }));
    app.use(notFoundHandler);
    app.use(errorHandler);

    return { app, profileUseCases, usersUseCases };
  }

  describe('Extended Settings API (GET/PATCH /api/v1/profile/settings)', () => {
    // Scenario 1: GET /profile/settings returns extended fields with defaults
    it('Scenario 1: GET /api/v1/profile/settings returns extended fields with defaults', async () => {
      const { app } = createTestApp();
      const res = await request(app).get('/api/v1/profile/settings');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        userId,
        themeMode: 'system',
        unitSystem: 'metric',
        healthConnectEnabled: false,
        smartwatchConnected: false,
        notificationsEnabled: true,
        language: 'en',
        privacyAnalytics: true,
        privacyPhotoRetention: true,
        privacyCoachSharing: false,
        notificationSchedule: {},
      });
    });

    // Scenario 2: PATCH /profile/settings with language 'ta' persists correctly
    it('Scenario 2: PATCH /api/v1/profile/settings with language: "ta" updates correctly', async () => {
      const { app, profileUseCases } = createTestApp();
      const res = await request(app)
        .patch('/api/v1/profile/settings')
        .send({ language: 'ta' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.language).toBe('ta');
      expect(profileUseCases.updateSettings.execute).toHaveBeenCalledWith(
        expect.objectContaining({ userId }),
        expect.objectContaining({ language: 'ta' }),
      );
    });

    // Scenario 3: PATCH /profile/settings with invalid language (e.g. 'fr') -> 400
    it('Scenario 3: PATCH /api/v1/profile/settings rejects unsupported language with 400 VALIDATION_FAILED', async () => {
      const { app } = createTestApp();
      const res = await request(app)
        .patch('/api/v1/profile/settings')
        .send({ language: 'fr' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    // Scenario 4: PATCH /profile/settings with privacy fields persists correctly
    it('Scenario 4: PATCH /api/v1/profile/settings updates privacy fields correctly', async () => {
      const { app, profileUseCases } = createTestApp();
      const res = await request(app)
        .patch('/api/v1/profile/settings')
        .send({
          privacyAnalytics: false,
          privacyPhotoRetention: false,
          privacyCoachSharing: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        privacyAnalytics: false,
        privacyPhotoRetention: false,
        privacyCoachSharing: true,
      });
      expect(profileUseCases.updateSettings.execute).toHaveBeenCalledWith(
        expect.objectContaining({ userId }),
        expect.objectContaining({
          privacyAnalytics: false,
          privacyPhotoRetention: false,
          privacyCoachSharing: true,
        }),
      );
    });

    // Scenario 5: PATCH /profile/settings with notification schedule persists correctly
    it('Scenario 5: PATCH /api/v1/profile/settings updates notification schedule correctly', async () => {
      const schedule = {
        workoutReminders: { enabled: true, time: '07:30', days: [1, 2, 3, 4, 5] },
        hydrationReminders: { enabled: false },
      };
      const { app, profileUseCases } = createTestApp();
      const res = await request(app)
        .patch('/api/v1/profile/settings')
        .send({ notificationSchedule: schedule });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.notificationSchedule).toEqual(schedule);
      expect(profileUseCases.updateSettings.execute).toHaveBeenCalledWith(
        expect.objectContaining({ userId }),
        expect.objectContaining({ notificationSchedule: schedule }),
      );
    });

    // Scenario 6: PATCH /profile/settings with unknown field -> 400 (strict schema)
    it('Scenario 6: PATCH /api/v1/profile/settings rejects unknown fields with 400 VALIDATION_FAILED', async () => {
      const { app } = createTestApp();
      const res = await request(app)
        .patch('/api/v1/profile/settings')
        .send({ maliciousField: true, hacking: '123' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    // Scenario 7: Backward compatibility - existing fields work without new fields
    it('Scenario 7: PATCH /api/v1/profile/settings preserves backward compatibility for existing fields', async () => {
      const { app, profileUseCases } = createTestApp();
      const res = await request(app)
        .patch('/api/v1/profile/settings')
        .send({
          themeMode: 'dark',
          unitSystem: 'imperial',
          healthConnectEnabled: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.themeMode).toBe('dark');
      expect(res.body.data.unitSystem).toBe('imperial');
      expect(profileUseCases.updateSettings.execute).toHaveBeenCalledWith(
        expect.objectContaining({ userId }),
        {
          themeMode: 'dark',
          unitSystem: 'imperial',
          healthConnectEnabled: true,
        },
      );
    });

    // Scenario 13: Privacy defaults check (explicit opt-in verification)
    it('Scenario 13: UserSettings domain creates explicit opt-in privacy defaults', () => {
      const domainSettings = UserSettings.createDefault(userId);
      expect(domainSettings.language).toBe('en');
      expect(domainSettings.privacyAnalytics).toBe(true);
      expect(domainSettings.privacyPhotoRetention).toBe(true);
      expect(domainSettings.privacyCoachSharing).toBe(false); // Explicit opt-in!
      expect(domainSettings.notificationSchedule).toEqual({});
    });
  });

  describe('Secure Account Deletion API (DELETE /api/v1/users/me)', () => {
    // Scenario 8: DELETE /users/me — unauthenticated -> 401
    it('Scenario 8: DELETE /api/v1/users/me rejects unauthenticated request with 401', async () => {
      const { app } = createTestApp({ authenticated: false });
      const res = await request(app)
        .delete('/api/v1/users/me')
        .send({ password: 'correct-password' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    // Scenario 9: DELETE /users/me — wrong password -> 422 INVALID_CREDENTIALS
    it('Scenario 9: DELETE /api/v1/users/me rejects invalid password with 422 INVALID_CREDENTIALS', async () => {
      const { app } = createTestApp();
      const res = await request(app)
        .delete('/api/v1/users/me')
        .send({ password: 'wrong-password' });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(res.body.error.message).toBe('The password is incorrect.');
    });

    // Scenario 10: DELETE /users/me — correct password -> 200 + { deletedUserId }
    it('Scenario 10: DELETE /api/v1/users/me deletes account with 200 and returns deletedUserId', async () => {
      const { app, usersUseCases } = createTestApp();
      const res = await request(app)
        .delete('/api/v1/users/me')
        .send({ password: 'correct-password' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({ deletedUserId: userId });
      expect(res.body.message).toBe('Account and all associated personal data permanently deleted.');
      expect(usersUseCases.deleteAccount.execute).toHaveBeenCalledWith(
        expect.objectContaining({ userId }),
        { password: 'correct-password' },
      );
    });

    // Scenario 11: DELETE /users/me — cannot delete another user's account
    it('Scenario 11: DELETE /api/v1/users/me uses JWT actor context exclusively', async () => {
      const { app, usersUseCases } = createTestApp({ actorUserId: otherUserId });
      const res = await request(app)
        .delete('/api/v1/users/me')
        .send({ password: 'correct-password' });

      expect(res.status).toBe(200);
      expect(res.body.data.deletedUserId).toBe(otherUserId);
      expect(usersUseCases.deleteAccount.execute).toHaveBeenCalledWith(
        expect.objectContaining({ userId: otherUserId }),
        { password: 'correct-password' },
      );
    });

    // Scenario 12: DELETE /users/me — user not found -> 404
    it('Scenario 12: DELETE /api/v1/users/me returns 404 if user not found in storage', async () => {
      const { app } = createTestApp({
        usersOverrides: {
          deleteAccount: {
            execute: vi.fn().mockRejectedValue(
              new AppError('not_found', 'USER_NOT_FOUND', 'User account not found.'),
            ),
          } as any,
        },
      });

      const res = await request(app)
        .delete('/api/v1/users/me')
        .send({ password: 'correct-password' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('USER_NOT_FOUND');
    });

    // Strict schema check on DELETE /api/v1/users/me: requires password string
    it('rejects DELETE /api/v1/users/me with missing or empty password', async () => {
      const { app } = createTestApp();
      const res = await request(app).delete('/api/v1/users/me').send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    // Rejects unknown fields in body on DELETE /api/v1/users/me
    it('rejects DELETE /api/v1/users/me with unknown fields in payload', async () => {
      const { app } = createTestApp();
      const res = await request(app)
        .delete('/api/v1/users/me')
        .send({ password: 'correct-password', extra: 'bad-input' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
  });
});
