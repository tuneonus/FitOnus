import type { Request } from 'express';
import { requireActor } from '../../../middleware/authenticate.js';
import { getValidated } from '../../../middleware/validate.js';
import type { RouteResult } from '../../../shared/http/route.js';
import { EnrollmentNotFoundError } from '../domain/errors.js';
import type {
  ListActiveChallengesUseCase,
  EnrollChallengeUseCase,
  EvaluateChallengeProgressUseCase,
  ClaimChallengeRewardUseCase,
  GetChallengeHistoryUseCase,
  ListUserBadgesUseCase,
  GetGamificationSummaryUseCase,
} from '../index.js';
import type { GetPointsHistoryUseCase } from '../application/use-cases/get-points-history.js';
import type {
  ActiveChallengeItemView,
  BadgeView,
  ChallengeEnrollmentView,
  GamificationProfileView,
  PointsLedgerView,
} from '../application/views.js';
import type { ClaimChallengeRewardResult } from '../application/use-cases/claim-challenge-reward.js';
import {
  listActiveChallengesRequest,
  getChallengeHistoryRequest,
  enrollChallengeRequest,
  getChallengeProgressRequest,
  claimChallengeRewardRequest,
  getPointsHistoryRequest,
} from './challenges.schemas.js';

export interface ChallengesMemberUseCases {
  listActiveChallenges: ListActiveChallengesUseCase;
  getChallengeHistory: GetChallengeHistoryUseCase;
  enrollChallenge: EnrollChallengeUseCase;
  evaluateChallengeProgress: EvaluateChallengeProgressUseCase;
  claimChallengeReward: ClaimChallengeRewardUseCase;
  getGamificationSummary: GetGamificationSummaryUseCase;
  listUserBadges: ListUserBadgesUseCase;
  getPointsHistory: GetPointsHistoryUseCase;
}

export type ChallengesMemberController = ReturnType<typeof createChallengesMemberController>;

export function createChallengesMemberController(useCases: ChallengesMemberUseCases) {
  return {
    async listActiveChallenges(req: Request): Promise<RouteResult<ActiveChallengeItemView[]>> {
      const actor = requireActor(req);
      const validated = getValidated(req, listActiveChallengesRequest);
      const res = await useCases.listActiveChallenges.execute({
        userId: actor.userId,
        timezone: validated.query?.timezone,
      });
      return {
        data: res.challenges,
        message: 'Active challenges retrieved successfully',
      };
    },

    async getChallengeHistory(req: Request): Promise<RouteResult<ActiveChallengeItemView[]>> {
      const actor = requireActor(req);
      const validated = getValidated(req, getChallengeHistoryRequest);
      const res = await useCases.getChallengeHistory.execute({
        userId: actor.userId,
        status: validated.query?.status,
      });
      return {
        data: res.history,
        message: 'Challenge history retrieved successfully',
      };
    },

    async enrollChallenge(req: Request): Promise<RouteResult<ChallengeEnrollmentView>> {
      const actor = requireActor(req);
      const validated = getValidated(req, enrollChallengeRequest);
      const res = await useCases.enrollChallenge.execute({
        userId: actor.userId,
        occurrenceId: validated.params.occurrenceId,
      });
      return {
        data: res.enrollment,
        status: 201,
        message: 'Enrolled in challenge occurrence successfully',
      };
    },

    async getChallengeProgress(req: Request): Promise<RouteResult<ChallengeEnrollmentView>> {
      const actor = requireActor(req);
      const validated = getValidated(req, getChallengeProgressRequest);
      const res = await useCases.evaluateChallengeProgress.execute({
        userId: actor.userId,
        occurrenceId: validated.params.occurrenceId,
      });
      const enrollment = res.enrollments[0];
      if (!enrollment) {
        throw new EnrollmentNotFoundError(validated.params.occurrenceId);
      }
      return {
        data: enrollment,
        message: 'Challenge progress evaluated successfully',
      };
    },

    async claimChallengeReward(req: Request): Promise<RouteResult<ClaimChallengeRewardResult>> {
      const actor = requireActor(req);
      const validated = getValidated(req, claimChallengeRewardRequest);
      const res = await useCases.claimChallengeReward.execute({
        userId: actor.userId,
        occurrenceId: validated.params.occurrenceId,
      });
      return {
        data: res,
        message: 'Challenge reward claimed successfully',
      };
    },

    async getGamificationSummary(req: Request): Promise<RouteResult<GamificationProfileView>> {
      const actor = requireActor(req);
      const res = await useCases.getGamificationSummary.execute({
        userId: actor.userId,
      });
      return {
        data: res.profile,
        message: 'Gamification summary retrieved successfully',
      };
    },

    async listUserBadges(req: Request): Promise<RouteResult<BadgeView[]>> {
      const actor = requireActor(req);
      const res = await useCases.listUserBadges.execute({
        userId: actor.userId,
      });
      return {
        data: res.badges,
        message: 'Badges retrieved successfully',
      };
    },

    async getPointsHistory(req: Request): Promise<RouteResult<PointsLedgerView[]>> {
      const actor = requireActor(req);
      const validated = getValidated(req, getPointsHistoryRequest);
      const res = await useCases.getPointsHistory.execute({
        userId: actor.userId,
        limit: validated.query?.limit,
      });
      return {
        data: res.points,
        message: 'Points ledger history retrieved successfully',
      };
    },
  };
}
