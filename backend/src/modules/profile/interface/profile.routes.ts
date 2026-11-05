import { defineRoute, type RouteGroup } from '../../../shared/http/route.js';
import type { ProfileController } from './profile.controller.js';
import {
  onboardingCompleteSchema,
  saveOnboardingStepRequest,
  updateProfileRequest,
  updateSettingsRequest,
  userProfileSchema,
  userSettingsSchema,
} from './profile.schemas.js';

const tags = ['Profile & Onboarding'];

export function createProfileRoutes(basePath: string, controller: ProfileController): RouteGroup {
  return {
    basePath,
    routes: [
      defineRoute({
        method: 'get',
        path: '/me',
        summary: 'Get current user fitness profile',
        description:
          'Retrieves the authenticated user biometrics, fitness goals, routine preferences, and calculated targets.',
        tags,
        access: { kind: 'authenticated' },
        response: {
          status: 200,
          description: 'Current fitness profile',
          message: 'Fitness profile retrieved',
          schema: userProfileSchema,
        },
        handler: controller.getMe,
      }),
      defineRoute({
        method: 'patch',
        path: '/me',
        summary: 'Update current user fitness profile',
        description:
          'Updates fitness profile fields using optimistic locking. Requires the current row version.',
        tags,
        access: { kind: 'authenticated' },
        request: updateProfileRequest,
        response: {
          status: 200,
          description: 'Updated fitness profile',
          message: 'Fitness profile updated',
          schema: userProfileSchema,
        },
        errorStatuses: [400, 409],
        handler: controller.updateMe,
      }),
      defineRoute({
        method: 'post',
        path: '/onboarding/step',
        summary: 'Save intermediate onboarding step progress',
        description:
          'Incrementally persists onboarding step progress to prevent data loss across app pauses or network disruptions.',
        tags,
        access: { kind: 'authenticated' },
        request: saveOnboardingStepRequest,
        response: {
          status: 200,
          description: 'Profile with saved step',
          message: 'Onboarding step progress saved',
          schema: userProfileSchema,
        },
        errorStatuses: [400],
        handler: controller.saveOnboardingStep,
      }),
      defineRoute({
        method: 'post',
        path: '/onboarding/complete',
        summary: 'Finalize onboarding and calculate metabolic targets',
        description:
          'Validates required metrics, calculates Mifflin-St Jeor targets, and marks onboarding complete.',
        tags,
        access: { kind: 'authenticated' },
        response: {
          status: 200,
          description: 'Calculated onboarding plan',
          message: 'Onboarding completed successfully',
          schema: onboardingCompleteSchema,
        },
        errorStatuses: [400],
        handler: controller.completeOnboarding,
      }),
      defineRoute({
        method: 'get',
        path: '/settings',
        summary: 'Get current user application settings',
        description: 'Retrieves client preferences including theme, units, and health integrations.',
        tags,
        access: { kind: 'authenticated' },
        response: {
          status: 200,
          description: 'Current application settings',
          message: 'User settings retrieved',
          schema: userSettingsSchema,
        },
        handler: controller.getSettings,
      }),
      defineRoute({
        method: 'patch',
        path: '/settings',
        summary: 'Update current user application settings',
        description: 'Updates client preferences such as theme, unit system, or health permissions.',
        tags,
        access: { kind: 'authenticated' },
        request: updateSettingsRequest,
        response: {
          status: 200,
          description: 'Updated application settings',
          message: 'User settings updated',
          schema: userSettingsSchema,
        },
        errorStatuses: [400],
        handler: controller.updateSettings,
      }),
    ],
  };
}
