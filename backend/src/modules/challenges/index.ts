import type { SqlExecutor } from '../../database/transaction.js';
import type { UnitOfWork } from '../../shared/application/unit-of-work.js';
import type { RouteGroup } from '../../shared/http/route.js';
import { PgBadgeRepository } from './infrastructure/pg-badge-repository.js';
import { PgChallengeEnrollmentRepository } from './infrastructure/pg-enrollment-repository.js';
import { PgChallengeOccurrenceRepository } from './infrastructure/pg-occurrence-repository.js';
import { PgChallengeRepository } from './infrastructure/pg-challenge-repository.js';
import { PgGamificationRepository } from './infrastructure/pg-gamification-repository.js';
import { PgGamificationTelemetryAdapter } from './infrastructure/pg-gamification-telemetry-adapter.js';

import { ChallengeEvaluatorService } from './application/services/challenge-evaluator.js';
import { GamificationEvaluationTrigger } from './application/services/evaluation-trigger.js';

import { ListActiveChallengesUseCase } from './application/use-cases/list-active-challenges.js';
import { EnrollChallengeUseCase } from './application/use-cases/enroll-challenge.js';
import { EvaluateChallengeProgressUseCase } from './application/use-cases/evaluate-challenge-progress.js';
import { ClaimChallengeRewardUseCase } from './application/use-cases/claim-challenge-reward.js';
import { GetChallengeHistoryUseCase } from './application/use-cases/get-challenge-history.js';
import { ListUserBadgesUseCase } from './application/use-cases/list-user-badges.js';
import { EvaluateMilestonesAndBadgesUseCase } from './application/use-cases/evaluate-milestones-and-badges.js';
import { GetGamificationSummaryUseCase } from './application/use-cases/get-gamification-summary.js';
import { GetPointsHistoryUseCase } from './application/use-cases/get-points-history.js';

import { AdminCreateChallengeUseCase } from './application/use-cases/admin-create-challenge.js';
import { AdminUpdateChallengeUseCase } from './application/use-cases/admin-update-challenge.js';
import {
  AdminPublishChallengeUseCase,
  AdminArchiveChallengeUseCase,
  AdminListChallengesUseCase,
  AdminGetChallengeUseCase,
} from './application/use-cases/admin-status-challenge.js';

import {
  createChallengesMemberController,
  type ChallengesMemberController,
} from './interface/challenges.controller.js';
import {
  createChallengesAdminController,
  type ChallengesAdminController,
} from './interface/admin-challenges.controller.js';
import {
  createChallengesMemberRoutes,
  createGamificationMemberRoutes,
} from './interface/challenges.routes.js';
import { createChallengesAdminRoutes } from './interface/admin-challenges.routes.js';

export * from './domain/badge.js';
export * from './domain/challenge.js';
export * from './domain/challenge-enrollment.js';
export * from './domain/challenge-occurrence.js';
export * from './domain/errors.js';
export * from './domain/gamification-profile.js';
export * from './domain/level-calculator.js';
export * from './domain/period-calculator.js';
export * from './domain/points-ledger.js';
export * from './domain/user-badge.js';

export * from './application/ports.js';
export * from './application/views.js';
export * from './application/services/challenge-evaluator.js';
export * from './application/services/evaluation-trigger.js';

export * from './application/use-cases/list-active-challenges.js';
export * from './application/use-cases/enroll-challenge.js';
export * from './application/use-cases/evaluate-challenge-progress.js';
export * from './application/use-cases/claim-challenge-reward.js';
export * from './application/use-cases/get-challenge-history.js';
export * from './application/use-cases/list-user-badges.js';
export * from './application/use-cases/evaluate-milestones-and-badges.js';
export * from './application/use-cases/get-gamification-summary.js';
export * from './application/use-cases/get-points-history.js';

export * from './application/use-cases/admin-create-challenge.js';
export * from './application/use-cases/admin-update-challenge.js';
export * from './application/use-cases/admin-status-challenge.js';

export * from './interface/challenges.schemas.js';
export * from './interface/challenges.controller.js';
export * from './interface/challenges.routes.js';
export * from './interface/admin-challenges.controller.js';
export * from './interface/admin-challenges.routes.js';

export interface ChallengesModule {
  memberChallengesRoutes: RouteGroup;
  memberGamificationRoutes: RouteGroup;
  adminChallengesRoutes: RouteGroup;
  routes: RouteGroup[];

  challengeRepo: PgChallengeRepository;
  occurrenceRepo: PgChallengeOccurrenceRepository;
  enrollmentRepo: PgChallengeEnrollmentRepository;
  badgeRepo: PgBadgeRepository;
  gamificationRepo: PgGamificationRepository;
  telemetryAdapter: PgGamificationTelemetryAdapter;
  evaluatorService: ChallengeEvaluatorService;
  evaluationTrigger: GamificationEvaluationTrigger;

  memberController: ChallengesMemberController;
  adminController: ChallengesAdminController;

  // Member Use Cases
  listActiveChallenges: ListActiveChallengesUseCase;
  enrollChallenge: EnrollChallengeUseCase;
  evaluateChallengeProgress: EvaluateChallengeProgressUseCase;
  claimChallengeReward: ClaimChallengeRewardUseCase;
  getChallengeHistory: GetChallengeHistoryUseCase;
  listUserBadges: ListUserBadgesUseCase;
  evaluateMilestones: EvaluateMilestonesAndBadgesUseCase;
  getGamificationSummary: GetGamificationSummaryUseCase;
  getPointsHistory: GetPointsHistoryUseCase;

  // Admin Use Cases
  adminCreateChallenge: AdminCreateChallengeUseCase;
  adminUpdateChallenge: AdminUpdateChallengeUseCase;
  adminPublishChallenge: AdminPublishChallengeUseCase;
  adminArchiveChallenge: AdminArchiveChallengeUseCase;
  adminListChallenges: AdminListChallengesUseCase;
  adminGetChallenge: AdminGetChallengeUseCase;
}

export interface CreateChallengesModuleOptions {
  basePath?: string;
  memberBasePath?: string;
  gamificationBasePath?: string;
  adminBasePath?: string;
  db: SqlExecutor;
  uow?: UnitOfWork;
}

export function createChallengesModule(deps: CreateChallengesModuleOptions): ChallengesModule {
  const challengeRepo = new PgChallengeRepository(deps.db);
  const occurrenceRepo = new PgChallengeOccurrenceRepository(deps.db);
  const enrollmentRepo = new PgChallengeEnrollmentRepository(deps.db);
  const badgeRepo = new PgBadgeRepository(deps.db);
  const gamificationRepo = new PgGamificationRepository(deps.db);
  const telemetryAdapter = new PgGamificationTelemetryAdapter(deps.db);

  const evaluatorService = new ChallengeEvaluatorService(telemetryAdapter);

  const evaluateChallengeProgress = new EvaluateChallengeProgressUseCase(
    challengeRepo,
    occurrenceRepo,
    enrollmentRepo,
    evaluatorService,
  );

  const evaluateMilestones = new EvaluateMilestonesAndBadgesUseCase(
    badgeRepo,
    badgeRepo,
    gamificationRepo,
    gamificationRepo,
    telemetryAdapter,
  );

  const evaluationTrigger = new GamificationEvaluationTrigger(evaluateChallengeProgress, evaluateMilestones);

  const listActiveChallenges = new ListActiveChallengesUseCase(
    challengeRepo,
    occurrenceRepo,
    enrollmentRepo,
    evaluatorService,
  );

  const enrollChallenge = new EnrollChallengeUseCase(challengeRepo, occurrenceRepo, enrollmentRepo);

  const claimChallengeReward = new ClaimChallengeRewardUseCase(
    challengeRepo,
    occurrenceRepo,
    enrollmentRepo,
    gamificationRepo,
    evaluatorService,
  );

  const getChallengeHistory = new GetChallengeHistoryUseCase(challengeRepo, occurrenceRepo, enrollmentRepo);

  const listUserBadges = new ListUserBadgesUseCase(badgeRepo, badgeRepo);

  const getGamificationSummary = new GetGamificationSummaryUseCase(
    gamificationRepo,
    gamificationRepo,
    badgeRepo,
  );

  const getPointsHistory = new GetPointsHistoryUseCase(gamificationRepo);

  const adminCreateChallenge = new AdminCreateChallengeUseCase(challengeRepo);
  const adminUpdateChallenge = new AdminUpdateChallengeUseCase(challengeRepo, occurrenceRepo, enrollmentRepo);
  const adminPublishChallenge = new AdminPublishChallengeUseCase(challengeRepo);
  const adminArchiveChallenge = new AdminArchiveChallengeUseCase(challengeRepo);
  const adminListChallenges = new AdminListChallengesUseCase(challengeRepo);
  const adminGetChallenge = new AdminGetChallengeUseCase(challengeRepo);

  const memberController = createChallengesMemberController({
    listActiveChallenges,
    getChallengeHistory,
    enrollChallenge,
    evaluateChallengeProgress,
    claimChallengeReward,
    getGamificationSummary,
    listUserBadges,
    getPointsHistory,
  });

  const adminController = createChallengesAdminController({
    adminListChallenges,
    adminGetChallenge,
    adminCreateChallenge,
    adminUpdateChallenge,
    adminPublishChallenge,
    adminArchiveChallenge,
    db: deps.db,
    badgeRepo,
  });

  const memberBasePath =
    deps.memberBasePath ?? (deps.basePath ? `${deps.basePath}/challenges` : '/api/v1/challenges');
  const gamificationBasePath =
    deps.gamificationBasePath ?? (deps.basePath ? `${deps.basePath}/gamification` : '/api/v1/gamification');
  const adminBasePath =
    deps.adminBasePath ?? (deps.basePath ? `${deps.basePath}/admin/challenges` : '/api/v1/admin/challenges');

  const memberChallengesRoutes = createChallengesMemberRoutes(memberBasePath, memberController);
  const memberGamificationRoutes = createGamificationMemberRoutes(gamificationBasePath, memberController);
  const adminChallengesRoutes = createChallengesAdminRoutes(adminBasePath, adminController);

  return {
    memberChallengesRoutes,
    memberGamificationRoutes,
    adminChallengesRoutes,
    routes: [memberChallengesRoutes, memberGamificationRoutes, adminChallengesRoutes],

    challengeRepo,
    occurrenceRepo,
    enrollmentRepo,
    badgeRepo,
    gamificationRepo,
    telemetryAdapter,
    evaluatorService,
    evaluationTrigger,

    memberController,
    adminController,

    listActiveChallenges,
    enrollChallenge,
    evaluateChallengeProgress,
    claimChallengeReward,
    getChallengeHistory,
    listUserBadges,
    evaluateMilestones,
    getGamificationSummary,
    getPointsHistory,

    adminCreateChallenge,
    adminUpdateChallenge,
    adminPublishChallenge,
    adminArchiveChallenge,
    adminListChallenges,
    adminGetChallenge,
  };
}
