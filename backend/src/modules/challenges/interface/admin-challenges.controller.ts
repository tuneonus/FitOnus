import type { Request } from 'express';
import { requireActor } from '../../../middleware/authenticate.js';
import { getValidated } from '../../../middleware/validate.js';
import type { RouteResult } from '../../../shared/http/route.js';
import type {
  AdminCreateChallengeUseCase,
  AdminUpdateChallengeUseCase,
  AdminPublishChallengeUseCase,
  AdminArchiveChallengeUseCase,
  AdminListChallengesUseCase,
} from '../index.js';
import type { AdminGetChallengeUseCase } from '../application/use-cases/admin-status-challenge.js';
import type { ChallengeView } from '../application/views.js';
import {
  adminListChallengesRequest,
  adminGetChallengeRequest,
  adminCreateChallengeRequest,
  adminUpdateChallengeRequest,
  adminPublishChallengeRequest,
  adminArchiveChallengeRequest,
} from './challenges.schemas.js';

export interface ChallengesAdminUseCases {
  adminListChallenges: AdminListChallengesUseCase;
  adminGetChallenge: AdminGetChallengeUseCase;
  adminCreateChallenge: AdminCreateChallengeUseCase;
  adminUpdateChallenge: AdminUpdateChallengeUseCase;
  adminPublishChallenge: AdminPublishChallengeUseCase;
  adminArchiveChallenge: AdminArchiveChallengeUseCase;
}

export type ChallengesAdminController = ReturnType<typeof createChallengesAdminController>;

export function createChallengesAdminController(useCases: ChallengesAdminUseCases) {
  return {
    async listChallenges(req: Request): Promise<RouteResult<ChallengeView[]>> {
      requireActor(req);
      const validated = getValidated(req, adminListChallengesRequest);
      const res = await useCases.adminListChallenges.execute(validated.query);
      return {
        data: res.challenges,
        message: 'Admin challenges retrieved successfully',
      };
    },

    async getChallenge(req: Request): Promise<RouteResult<ChallengeView>> {
      requireActor(req);
      const validated = getValidated(req, adminGetChallengeRequest);
      const res = await useCases.adminGetChallenge.execute({ id: validated.params.challengeId });
      return {
        data: res.challenge,
        message: 'Admin challenge details retrieved successfully',
      };
    },

    async createChallenge(req: Request): Promise<RouteResult<ChallengeView>> {
      requireActor(req);
      const validated = getValidated(req, adminCreateChallengeRequest);
      const res = await useCases.adminCreateChallenge.execute(validated.body);
      return {
        data: res.challenge,
        status: 201,
        message: 'Challenge created successfully',
      };
    },

    async updateChallenge(req: Request): Promise<RouteResult<ChallengeView>> {
      requireActor(req);
      const validated = getValidated(req, adminUpdateChallengeRequest);
      const res = await useCases.adminUpdateChallenge.execute({
        id: validated.params.challengeId,
        ...validated.body,
      });
      return {
        data: res.challenge,
        message: 'Challenge updated successfully',
      };
    },

    async publishChallenge(req: Request): Promise<RouteResult<ChallengeView>> {
      requireActor(req);
      const validated = getValidated(req, adminPublishChallengeRequest);
      const res = await useCases.adminPublishChallenge.execute({ id: validated.params.challengeId });
      return {
        data: res.challenge,
        message: 'Challenge published successfully',
      };
    },

    async archiveChallenge(req: Request): Promise<RouteResult<ChallengeView>> {
      requireActor(req);
      const validated = getValidated(req, adminArchiveChallengeRequest);
      const res = await useCases.adminArchiveChallenge.execute({ id: validated.params.challengeId });
      return {
        data: res.challenge,
        message: 'Challenge archived successfully',
      };
    },
  };
}

