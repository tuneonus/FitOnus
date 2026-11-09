import { z } from 'zod';
import { defineRoute, type RouteGroup } from '../../../shared/http/route.js';
import type { ChallengesAdminController } from './admin-challenges.controller.js';
import {
  adminArchiveChallengeRequest,
  adminBadgeViewSchema,
  adminChallengeStatsSchema,
  adminCreateBadgeRequest,
  adminCreateChallengeRequest,
  adminDeleteBadgeRequest,
  adminGetChallengeRequest,
  adminListBadgesRequest,
  adminListChallengesRequest,
  adminPublishChallengeRequest,
  adminUpdateChallengeRequest,
  challengeViewSchema,
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
        handler: (req) => controller.listChallenges(req),
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
        handler: (req) => controller.createChallenge(req),
      }),

      // 3. Admin Challenge Statistics
      defineRoute({
        method: 'get',
        path: '/stats',
        summary: 'Admin Challenge Statistics',
        description: 'Aggregate platform challenge statistics, participation, and completion metrics.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        response: {
          status: 200,
          description: 'Challenge statistics',
          message: 'Admin challenge statistics retrieved successfully',
          schema: adminChallengeStatsSchema,
        },
        errorStatuses: [401, 403],
        handler: (req) => controller.getStats(req),
      }),

      // 4. Admin List Badges
      defineRoute({
        method: 'get',
        path: '/badges',
        summary: 'Admin List Badges',
        description: 'Browse standard and custom gamification badges catalog.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: adminListBadgesRequest,
        response: {
          status: 200,
          description: 'Badges list',
          message: 'Admin badges retrieved successfully',
          schema: z.array(adminBadgeViewSchema),
        },
        errorStatuses: [400, 401, 403],
        handler: (req) => controller.listBadges(req),
      }),

      // 5. Admin Create Custom Badge
      defineRoute({
        method: 'post',
        path: '/badges',
        summary: 'Admin Create Custom Badge',
        description: 'Register a new gamification achievement badge into the catalog.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: adminCreateBadgeRequest,
        response: {
          status: 201,
          description: 'Badge created',
          message: 'Badge created successfully',
          schema: adminBadgeViewSchema,
        },
        errorStatuses: [400, 401, 403, 409],
        handler: (req) => controller.createBadge(req),
      }),

      // 6. Admin Deactivate Badge
      defineRoute({
        method: 'delete',
        path: '/badges/:id',
        summary: 'Admin Deactivate Badge',
        description: 'Deactivates a gamification badge from future challenge rewards.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: adminDeleteBadgeRequest,
        response: {
          status: 200,
          description: 'Badge deactivated',
          message: 'Badge deactivated successfully',
          schema: z.object({ id: z.string().uuid(), deleted: z.boolean() }),
        },
        errorStatuses: [400, 401, 403, 404],
        handler: (req) => controller.deleteBadge(req),
      }),

      // 7. Admin Get Challenge Details
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
        handler: (req) => controller.getChallenge(req),
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
        handler: (req) => controller.updateChallenge(req),
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
        handler: (req) => controller.publishChallenge(req),
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
        handler: (req) => controller.archiveChallenge(req),
      }),
    ],
  };
}
