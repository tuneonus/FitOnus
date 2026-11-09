import type { Request } from 'express';
import type { SqlExecutor } from '../../../database/transaction.js';
import { requireActor } from '../../../middleware/authenticate.js';
import { getValidated } from '../../../middleware/validate.js';
import { AppError } from '../../../shared/errors/app-error.js';
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
import type { PgBadgeRepository } from '../infrastructure/pg-badge-repository.js';
import {
  adminArchiveChallengeRequest,
  adminCreateBadgeRequest,
  adminCreateChallengeRequest,
  adminDeleteBadgeRequest,
  adminGetChallengeRequest,
  adminListBadgesRequest,
  adminListChallengesRequest,
  adminPublishChallengeRequest,
  adminUpdateChallengeRequest,
} from './challenges.schemas.js';

export interface ChallengesAdminUseCases {
  adminListChallenges: AdminListChallengesUseCase;
  adminGetChallenge: AdminGetChallengeUseCase;
  adminCreateChallenge: AdminCreateChallengeUseCase;
  adminUpdateChallenge: AdminUpdateChallengeUseCase;
  adminPublishChallenge: AdminPublishChallengeUseCase;
  adminArchiveChallenge: AdminArchiveChallengeUseCase;
  db?: SqlExecutor;
  badgeRepo?: PgBadgeRepository;
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

    async getStats(_req: Request): Promise<RouteResult<unknown>> {
      if (!useCases.db) {
        return {
          data: {
            totalChallenges: 0,
            publishedChallenges: 0,
            totalEnrollments: 0,
            activeParticipants: 0,
            completedEnrollments: 0,
            completionRatePct: 0,
            totalBadgesAwarded: 0,
            totalPointsAwarded: 0,
          },
          message: 'Admin challenge statistics retrieved successfully',
        };
      }
      const res = await useCases.db.query<{
        total_challenges: number;
        published_challenges: number;
        total_enrollments: number;
        active_participants: number;
        completed_enrollments: number;
        total_badges_awarded: number;
        total_points_awarded: number;
      }>(
        `SELECT
           (SELECT count(*)::int FROM challenges WHERE deleted_at IS NULL) AS total_challenges,
           (SELECT count(*)::int FROM challenges WHERE status = 'published' AND deleted_at IS NULL) AS published_challenges,
           (SELECT count(*)::int FROM challenge_enrollments) AS total_enrollments,
           (SELECT count(DISTINCT user_id)::int FROM challenge_enrollments WHERE status IN ('enrolled', 'in_progress', 'active')) AS active_participants,
           (SELECT count(*)::int FROM challenge_enrollments WHERE status = 'completed') AS completed_enrollments,
           (SELECT count(*)::int FROM user_badges) AS total_badges_awarded,
           (SELECT coalesce(sum(amount), 0)::int FROM gamification_points_ledger WHERE amount > 0) AS total_points_awarded`,
      );
      const row = res.rows[0] ?? {
        total_challenges: 0,
        published_challenges: 0,
        total_enrollments: 0,
        active_participants: 0,
        completed_enrollments: 0,
        total_badges_awarded: 0,
        total_points_awarded: 0,
      };
      const completionRatePct =
        row.total_enrollments > 0
          ? Math.round((row.completed_enrollments / row.total_enrollments) * 100)
          : 0;
      return {
        data: {
          totalChallenges: row.total_challenges,
          publishedChallenges: row.published_challenges,
          totalEnrollments: row.total_enrollments,
          activeParticipants: row.active_participants,
          completedEnrollments: row.completed_enrollments,
          completionRatePct,
          totalBadgesAwarded: row.total_badges_awarded,
          totalPointsAwarded: row.total_points_awarded,
        },
        message: 'Admin challenge statistics retrieved successfully',
      };
    },

    async listBadges(req: Request): Promise<RouteResult<unknown>> {
      requireActor(req);
      const validated = getValidated(req, adminListBadgesRequest);
      if (!useCases.db) {
        return {
          data: [],
          message: 'Admin badges retrieved successfully',
        };
      }
      const category = validated.query?.category;
      let sql = `SELECT * FROM badges`;
      const params: unknown[] = [];
      if (category) {
        sql += ` WHERE category = $1`;
        params.push(category);
      }
      sql += ` ORDER BY points_value ASC, created_at ASC`;
      const res = await useCases.db.query<{
        id: string;
        slug: string;
        name: string;
        description: string;
        category: string;
        tier: string;
        icon_name: string;
        points_value: number;
        unlock_condition: Record<string, unknown>;
        is_active: boolean;
        created_at: Date;
        updated_at: Date;
      }>(sql, params);
      const badges = res.rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        description: r.description,
        category: r.category,
        tier: r.tier,
        iconName: r.icon_name,
        pointsValue: r.points_value,
        unlockCondition: r.unlock_condition ?? {},
        isActive: r.is_active,
        createdAt: r.created_at.toISOString(),
        updatedAt: r.updated_at.toISOString(),
      }));
      return {
        data: badges,
        message: 'Admin badges retrieved successfully',
      };
    },

    async createBadge(req: Request): Promise<RouteResult<unknown>> {
      requireActor(req);
      const validated = getValidated(req, adminCreateBadgeRequest);
      const { slug, name, description, category, tier, iconName, pointsValue, unlockCondition } =
        validated.body;
      if (useCases.badgeRepo) {
        const existing = await useCases.badgeRepo.findBySlug(slug);
        if (existing) {
          throw new AppError('conflict', 'CONFLICT', `Badge with slug '${slug}' already exists`);
        }
      }
      const badgeId = crypto.randomUUID();
      const now = new Date();
      if (!useCases.db) {
        return {
          status: 201,
          data: {
            id: badgeId,
            slug,
            name,
            description,
            category,
            tier: tier ?? 'bronze',
            iconName: iconName ?? 'medal',
            pointsValue: pointsValue ?? 50,
            unlockCondition: unlockCondition ?? {},
            isActive: true,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
          message: 'Badge created successfully',
        };
      }
      await useCases.db.query(
        `INSERT INTO badges (
           id, slug, name, description, category, tier, icon_name,
           points_value, unlock_condition, is_active, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, $11)`,
        [
          badgeId,
          slug,
          name,
          description,
          category,
          tier ?? 'bronze',
          iconName ?? 'medal',
          pointsValue ?? 50,
          JSON.stringify(unlockCondition ?? {}),
          now,
          now,
        ],
      );
      return {
        status: 201,
        data: {
          id: badgeId,
          slug,
          name,
          description,
          category,
          tier: tier ?? 'bronze',
          iconName: iconName ?? 'medal',
          pointsValue: pointsValue ?? 50,
          unlockCondition: unlockCondition ?? {},
          isActive: true,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
        message: 'Badge created successfully',
      };
    },

    async deleteBadge(req: Request): Promise<RouteResult<unknown>> {
      requireActor(req);
      const validated = getValidated(req, adminDeleteBadgeRequest);
      if (!useCases.db) {
        return {
          status: 200,
          data: { id: validated.params.id, deleted: true },
          message: 'Badge deactivated successfully',
        };
      }
      const res = await useCases.db.query<{ id: string }>(
        `UPDATE badges SET is_active = false, updated_at = now() WHERE id = $1 RETURNING id`,
        [validated.params.id],
      );
      if (res.rows.length === 0) {
        throw new AppError('not_found', 'NOT_FOUND', `Badge '${validated.params.id}' not found`);
      }
      return {
        status: 200,
        data: { id: validated.params.id, deleted: true },
        message: 'Badge deactivated successfully',
      };
    },
  };
}
