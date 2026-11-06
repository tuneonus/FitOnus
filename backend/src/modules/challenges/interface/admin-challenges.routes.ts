import { z } from 'zod';
import { defineRoute, type RouteGroup } from '../../../shared/http/route.js';
import type { ChallengesAdminController } from './admin-challenges.controller.js';
import {
  challengeViewSchema,
  adminListChallengesRequest,
  adminGetChallengeRequest,
  adminCreateChallengeRequest,
  adminUpdateChallengeRequest,
  adminPublishChallengeRequest,
  adminArchiveChallengeRequest,
} from './challenges.schemas.js';

const tags = ['Admin Challenges'];

export function createChallengesAdminRoutes(
  basePath: string,
  controller: ChallengesAdminController,
): RouteGroup {
  return {
    basePath,
    routes: [
      // 1. Admin List Challenges
      defineRoute({
        method: 'get',
        path: '/',
        summary: 'Admin List Challenges',
        description: 'Browse all challenge definitions with cadence and status filters.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: adminListChallengesRequest,
        response: {
          status: 200,
          description: 'Challenges list',
          message: 'Admin challenges retrieved successfully',
          schema: z.array(challengeViewSchema),
        },
        errorStatuses: [400, 401, 403],
        handler: controller.listChallenges,
      }),

      // 2. Admin Create Challenge
      defineRoute({
        method: 'post',
        path: '/',
        summary: 'Admin Create Challenge',
        description: 'Create a new challenge definition with validation.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: adminCreateChallengeRequest,
        response: {
          status: 201,
          description: 'Created challenge',
          message: 'Challenge created successfully',
          schema: challengeViewSchema,
        },
        errorStatuses: [400, 401, 403, 409],
        handler: controller.createChallenge,
      }),

      // 3. Admin Get Challenge Details
      defineRoute({
        method: 'get',
        path: '/:challengeId',
        summary: 'Admin Get Challenge Details',
        description: 'Retrieve details of a specific challenge definition.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: adminGetChallengeRequest,
        response: {
          status: 200,
          description: 'Challenge details',
          message: 'Admin challenge details retrieved successfully',
          schema: challengeViewSchema,
        },
        errorStatuses: [400, 401, 403, 404],
        handler: controller.getChallenge,
      }),

      // 4. Admin Update Challenge
      defineRoute({
        method: 'patch',
        path: '/:challengeId',
        summary: 'Admin Update Challenge',
        description: 'Update an existing challenge definition, protecting active in-progress challenges.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: adminUpdateChallengeRequest,
        response: {
          status: 200,
          description: 'Updated challenge',
          message: 'Challenge updated successfully',
          schema: challengeViewSchema,
        },
        errorStatuses: [400, 401, 403, 404, 409],
        handler: controller.updateChallenge,
      }),

      // 5. Admin Publish Challenge
      defineRoute({
        method: 'post',
        path: '/:challengeId/publish',
        summary: 'Admin Publish Challenge',
        description: 'Transition challenge status to published.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: adminPublishChallengeRequest,
        response: {
          status: 200,
          description: 'Published challenge',
          message: 'Challenge published successfully',
          schema: challengeViewSchema,
        },
        errorStatuses: [400, 401, 403, 404],
        handler: controller.publishChallenge,
      }),

      // 6. Admin Archive Challenge
      defineRoute({
        method: 'post',
        path: '/:challengeId/archive',
        summary: 'Admin Archive Challenge',
        description: 'Archive a challenge definition without deleting historical records.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: adminArchiveChallengeRequest,
        response: {
          status: 200,
          description: 'Archived challenge',
          message: 'Challenge archived successfully',
          schema: challengeViewSchema,
        },
        errorStatuses: [400, 401, 403, 404],
        handler: controller.archiveChallenge,
      }),
    ],
  };
}

