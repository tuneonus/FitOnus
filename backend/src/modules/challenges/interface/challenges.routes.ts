import { z } from 'zod';
import { defineRoute, type RouteGroup } from '../../../shared/http/route.js';
import type { ChallengesMemberController } from './challenges.controller.js';
import {
  activeChallengeItemViewSchema,
  challengeEnrollmentViewSchema,
  badgeViewSchema,
  gamificationProfileViewSchema,
  pointsLedgerViewSchema,
  claimRewardResponseSchema,
  listActiveChallengesRequest,
  getChallengeHistoryRequest,
  enrollChallengeRequest,
  getChallengeProgressRequest,
  claimChallengeRewardRequest,
  getPointsHistoryRequest,
} from './challenges.schemas.js';

const challengeTags = ['Challenges'];
const gamificationTags = ['Gamification'];

export function createChallengesMemberRoutes(
  basePath: string,
  controller: ChallengesMemberController,
): RouteGroup {
  return {
    basePath,
    routes: [
      // 1. List Active Challenges with live progress
      defineRoute({
        method: 'get',
        path: '/',
        summary: 'List Active Challenges',
        description: 'Returns available active challenges with current occurrence, enrollment, and genuine progress.',
        tags: challengeTags,
        access: { kind: 'authenticated' },
        request: listActiveChallengesRequest,
        response: {
          status: 200,
          description: 'Active challenges list',
          message: 'Active challenges retrieved successfully',
          schema: z.array(activeChallengeItemViewSchema),
        },
        errorStatuses: [400, 401],
        handler: controller.listActiveChallenges,
      }),

      // 2. Challenge History
      defineRoute({
        method: 'get',
        path: '/history',
        summary: 'Get Challenge History',
        description: 'Returns authenticated user challenge participation history across occurrences.',
        tags: challengeTags,
        access: { kind: 'authenticated' },
        request: getChallengeHistoryRequest,
        response: {
          status: 200,
          description: 'Challenge history list',
          message: 'Challenge history retrieved successfully',
          schema: z.array(activeChallengeItemViewSchema),
        },
        errorStatuses: [400, 401],
        handler: controller.getChallengeHistory,
      }),

      // 3. Enroll Challenge Occurrence
      defineRoute({
        method: 'post',
        path: '/:occurrenceId/enroll',
        summary: 'Enroll in Challenge Occurrence',
        description: 'Enrolls authenticated user into an eligible challenge occurrence.',
        tags: challengeTags,
        access: { kind: 'authenticated' },
        request: enrollChallengeRequest,
        response: {
          status: 201,
          description: 'Created enrollment',
          message: 'Enrolled in challenge occurrence successfully',
          schema: challengeEnrollmentViewSchema,
        },
        errorStatuses: [400, 401, 404, 409],
        handler: controller.enrollChallenge,
      }),

      // 4. Get Challenge Progress
      defineRoute({
        method: 'get',
        path: '/:occurrenceId/progress',
        summary: 'Get Challenge Progress',
        description: 'Evaluates and returns actual progress for the authenticated user.',
        tags: challengeTags,
        access: { kind: 'authenticated' },
        request: getChallengeProgressRequest,
        response: {
          status: 200,
          description: 'Challenge progress',
          message: 'Challenge progress evaluated successfully',
          schema: challengeEnrollmentViewSchema,
        },
        errorStatuses: [400, 401, 404],
        handler: controller.getChallengeProgress,
      }),

      // 5. Claim Challenge Reward
      defineRoute({
        method: 'post',
        path: '/:occurrenceId/claim',
        summary: 'Claim Challenge Reward',
        description: 'Claims verified completed challenge reward (points and badge).',
        tags: challengeTags,
        access: { kind: 'authenticated' },
        request: claimChallengeRewardRequest,
        response: {
          status: 200,
          description: 'Claim result',
          message: 'Challenge reward claimed successfully',
          schema: claimRewardResponseSchema,
        },
        errorStatuses: [400, 401, 404, 409],
        handler: controller.claimChallengeReward,
      }),
    ],
  };
}

export function createGamificationMemberRoutes(
  basePath: string,
  controller: ChallengesMemberController,
): RouteGroup {
  return {
    basePath,
    routes: [
      // 1. Get Gamification Summary
      defineRoute({
        method: 'get',
        path: '/summary',
        summary: 'Get Gamification Summary',
        description: 'Returns total points, current level, progress, badge count, and challenges won.',
        tags: gamificationTags,
        access: { kind: 'authenticated' },
        response: {
          status: 200,
          description: 'Gamification summary',
          message: 'Gamification summary retrieved successfully',
          schema: gamificationProfileViewSchema,
        },
        errorStatuses: [401],
        handler: controller.getGamificationSummary,
      }),

      // 2. List Badges
      defineRoute({
        method: 'get',
        path: '/badges',
        summary: 'List Badges Catalog',
        description: 'Returns badge catalog annotated with user earned status and timestamps.',
        tags: gamificationTags,
        access: { kind: 'authenticated' },
        response: {
          status: 200,
          description: 'Badges list',
          message: 'Badges retrieved successfully',
          schema: z.array(badgeViewSchema),
        },
        errorStatuses: [401],
        handler: controller.listUserBadges,
      }),

      // 3. Points Ledger History
      defineRoute({
        method: 'get',
        path: '/points/history',
        summary: 'Get Points Ledger History',
        description: 'Returns authenticated user points transaction ledger history.',
        tags: gamificationTags,
        access: { kind: 'authenticated' },
        request: getPointsHistoryRequest,
        response: {
          status: 200,
          description: 'Points ledger entries',
          message: 'Points ledger history retrieved successfully',
          schema: z.array(pointsLedgerViewSchema),
        },
        errorStatuses: [400, 401],
        handler: controller.getPointsHistory,
      }),
    ],
  };
}

