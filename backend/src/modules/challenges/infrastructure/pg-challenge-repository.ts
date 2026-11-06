import type { SqlExecutor } from '../../../database/transaction.js';
import {
  Challenge,
  type ChallengeCadence,
  type ChallengeCategory,
  type ChallengeMetricType,
  type ChallengeStatus,
} from '../domain/challenge.js';
import type { IChallengeRepository } from '../application/ports.js';

interface ChallengeRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  cadence: string;
  category: string;
  metric_type: string;
  target_value: string | number;
  reward_points: number;
  reward_badge_id: string | null;
  status: string;
  auto_enroll: boolean;
  icon_name: string;
  banner_color: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

function toDomainChallenge(row: ChallengeRow): Challenge {
  return new Challenge({
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    cadence: row.cadence as ChallengeCadence,
    category: row.category as ChallengeCategory,
    metricType: row.metric_type as ChallengeMetricType,
    targetValue: Number(row.target_value),
    rewardPoints: row.reward_points,
    rewardBadgeId: row.reward_badge_id,
    status: row.status as ChallengeStatus,
    autoEnroll: row.auto_enroll,
    iconName: row.icon_name,
    bannerColor: row.banner_color,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  });
}

export class PgChallengeRepository implements IChallengeRepository {
  constructor(private readonly db: SqlExecutor) {}

  async findById(id: string): Promise<Challenge | null> {
    const res = await this.db.query<ChallengeRow>(
      `SELECT * FROM challenges WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [id],
    );
    const row = res.rows[0];
    return row ? toDomainChallenge(row) : null;
  }

  async findBySlug(slug: string): Promise<Challenge | null> {
    const res = await this.db.query<ChallengeRow>(
      `SELECT * FROM challenges WHERE slug = $1 AND deleted_at IS NULL LIMIT 1`,
      [slug.trim().toLowerCase()],
    );
    const row = res.rows[0];
    return row ? toDomainChallenge(row) : null;
  }

  async listPublished(): Promise<Challenge[]> {
    const res = await this.db.query<ChallengeRow>(
      `SELECT * FROM challenges 
       WHERE status = 'published' AND deleted_at IS NULL 
       ORDER BY cadence ASC, created_at DESC`,
    );
    return res.rows.map(toDomainChallenge);
  }

  async listAll(options: { cadence?: ChallengeCadence; status?: ChallengeStatus } = {}): Promise<Challenge[]> {
    const conditions: string[] = ['deleted_at IS NULL'];
    const values: unknown[] = [];

    if (options.cadence) {
      values.push(options.cadence);
      conditions.push(`cadence = $${values.length}`);
    }
    if (options.status) {
      values.push(options.status);
      conditions.push(`status = $${values.length}`);
    }

    const whereClause = conditions.join(' AND ');
    const res = await this.db.query<ChallengeRow>(
      `SELECT * FROM challenges WHERE ${whereClause} ORDER BY created_at DESC`,
      values,
    );
    return res.rows.map(toDomainChallenge);
  }

  async save(challenge: Challenge): Promise<void> {
    await this.db.query(
      `INSERT INTO challenges (
         id, slug, title, description, cadence, category, metric_type,
         target_value, reward_points, reward_badge_id, status, auto_enroll,
         icon_name, banner_color, metadata, created_at, updated_at, deleted_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11, $12,
         $13, $14, $15, $16, $17, $18
       )
       ON CONFLICT (id) DO UPDATE SET
         slug = EXCLUDED.slug,
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         cadence = EXCLUDED.cadence,
         category = EXCLUDED.category,
         metric_type = EXCLUDED.metric_type,
         target_value = EXCLUDED.target_value,
         reward_points = EXCLUDED.reward_points,
         reward_badge_id = EXCLUDED.reward_badge_id,
         status = EXCLUDED.status,
         auto_enroll = EXCLUDED.auto_enroll,
         icon_name = EXCLUDED.icon_name,
         banner_color = EXCLUDED.banner_color,
         metadata = EXCLUDED.metadata,
         updated_at = EXCLUDED.updated_at,
         deleted_at = EXCLUDED.deleted_at`,
      [
        challenge.id,
        challenge.slug,
        challenge.title,
        challenge.description,
        challenge.cadence,
        challenge.category,
        challenge.metricType,
        challenge.targetValue,
        challenge.rewardPoints,
        challenge.rewardBadgeId,
        challenge.status,
        challenge.autoEnroll,
        challenge.iconName,
        challenge.bannerColor,
        JSON.stringify(challenge.metadata),
        challenge.createdAt,
        challenge.updatedAt,
        challenge.deletedAt,
      ],
    );
  }

  async softDelete(id: string): Promise<void> {
    await this.db.query(
      `UPDATE challenges SET deleted_at = now(), updated_at = now() WHERE id = $1`,
      [id],
    );
  }
}

