import type { SqlExecutor } from '../../../database/transaction.js';
import { Badge, type BadgeCategory, type BadgeTier } from '../domain/badge.js';
import { UserBadge, type BadgeTriggerType } from '../domain/user-badge.js';
import type { IBadgeRepository, IUserBadgeRepository } from '../application/ports.js';

interface BadgeRow {
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
}

interface UserBadgeRow {
  id: string;
  user_id: string;
  badge_id: string;
  earned_at: Date;
  trigger_type: string;
  trigger_id: string | null;
  metadata: Record<string, unknown>;
}

function toDomainBadge(row: BadgeRow): Badge {
  return new Badge({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: row.category as BadgeCategory,
    tier: row.tier as BadgeTier,
    iconName: row.icon_name,
    pointsValue: row.points_value,
    unlockCondition: row.unlock_condition ?? {},
    isActive: row.is_active,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });
}

function toDomainUserBadge(row: UserBadgeRow): UserBadge {
  return new UserBadge({
    id: row.id,
    userId: row.user_id,
    badgeId: row.badge_id,
    earnedAt: new Date(row.earned_at),
    triggerType: row.trigger_type as BadgeTriggerType,
    triggerId: row.trigger_id,
    metadata: row.metadata ?? {},
  });
}

export class PgBadgeRepository implements IBadgeRepository, IUserBadgeRepository {
  constructor(private readonly db: SqlExecutor) {}

  async findById(id: string): Promise<Badge | null> {
    const res = await this.db.query<BadgeRow>(`SELECT * FROM badges WHERE id = $1 LIMIT 1`, [id]);
    const row = res.rows[0];
    return row ? toDomainBadge(row) : null;
  }

  async findBySlug(slug: string): Promise<Badge | null> {
    const res = await this.db.query<BadgeRow>(`SELECT * FROM badges WHERE slug = $1 LIMIT 1`, [
      slug.trim().toLowerCase(),
    ]);
    const row = res.rows[0];
    return row ? toDomainBadge(row) : null;
  }

  async listActive(): Promise<Badge[]> {
    const res = await this.db.query<BadgeRow>(
      `SELECT * FROM badges WHERE is_active = true ORDER BY points_value ASC, created_at ASC`,
    );
    return res.rows.map(toDomainBadge);
  }

  async save(badge: Badge): Promise<void> {
    await this.db.query(
      `INSERT INTO badges (
         id, slug, name, description, category, tier, icon_name,
         points_value, unlock_condition, is_active, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
         slug = EXCLUDED.slug,
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         category = EXCLUDED.category,
         tier = EXCLUDED.tier,
         icon_name = EXCLUDED.icon_name,
         points_value = EXCLUDED.points_value,
         unlock_condition = EXCLUDED.unlock_condition,
         is_active = EXCLUDED.is_active,
         updated_at = EXCLUDED.updated_at`,
      [
        badge.id,
        badge.slug,
        badge.name,
        badge.description,
        badge.category,
        badge.tier,
        badge.iconName,
        badge.pointsValue,
        JSON.stringify(badge.unlockCondition),
        badge.isActive,
        badge.createdAt,
        badge.updatedAt,
      ],
    );
  }

  async listByUser(userId: string): Promise<UserBadge[]> {
    const res = await this.db.query<UserBadgeRow>(
      `SELECT * FROM user_badges WHERE user_id = $1 ORDER BY earned_at DESC`,
      [userId],
    );
    return res.rows.map(toDomainUserBadge);
  }

  async hasBadge(userId: string, badgeId: string): Promise<boolean> {
    const res = await this.db.query<{ count: string | number }>(
      `SELECT COUNT(*)::int AS count FROM user_badges WHERE user_id = $1 AND badge_id = $2`,
      [userId, badgeId],
    );
    return Number(res.rows[0]?.count ?? 0) > 0;
  }

  async awardBadge(userBadge: UserBadge): Promise<boolean> {
    const res = await this.db.query<{ id: string }>(
      `INSERT INTO user_badges (
         id, user_id, badge_id, earned_at, trigger_type, trigger_id, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, badge_id) DO NOTHING
       RETURNING id`,
      [
        userBadge.id,
        userBadge.userId,
        userBadge.badgeId,
        userBadge.earnedAt,
        userBadge.triggerType,
        userBadge.triggerId,
        JSON.stringify(userBadge.metadata),
      ],
    );
    return res.rows.length > 0;
  }
}
