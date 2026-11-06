import type { SqlExecutor } from '../../../database/transaction.js';
import { GamificationProfile } from '../domain/gamification-profile.js';
import { PointsLedgerEntry, type PointSourceType } from '../domain/points-ledger.js';
import { calculateLevel } from '../domain/level-calculator.js';
import { RewardAlreadyClaimedError, IneligibleForRewardError } from '../domain/errors.js';
import type {
  IGamificationProfileRepository,
  IGamificationPointsLedgerRepository,
  IGamificationRewardPort,
} from '../application/ports.js';

interface ProfileRow {
  user_id: string;
  total_points: number;
  current_level: number;
  badges_count: number;
  challenges_won: number;
  updated_at: Date;
}

interface LedgerRow {
  id: string;
  user_id: string;
  points: number;
  source_type: string;
  source_id: string;
  description: string;
  created_at: Date;
}

function toDomainProfile(row: ProfileRow): GamificationProfile {
  return new GamificationProfile({
    userId: row.user_id,
    totalPoints: row.total_points,
    currentLevel: row.current_level,
    badgesCount: row.badges_count,
    challengesWon: row.challenges_won,
    updatedAt: new Date(row.updated_at),
  });
}

function toDomainLedgerEntry(row: LedgerRow): PointsLedgerEntry {
  return new PointsLedgerEntry({
    id: row.id,
    userId: row.user_id,
    points: row.points,
    sourceType: row.source_type as PointSourceType,
    sourceId: row.source_id,
    description: row.description,
    createdAt: new Date(row.created_at),
  });
}

export interface ClaimRewardTransactionInput {
  userId: string;
  occurrenceId: string;
  points: number;
  badgeId?: string | null;
  description: string;
}

export interface ClaimRewardTransactionResult {
  claimed: boolean;
  pointsAwarded: number;
  badgeAwarded: boolean;
  newTotalPoints: number;
  newLevel: number;
}

export class PgGamificationRepository
  implements
    IGamificationProfileRepository,
    IGamificationPointsLedgerRepository,
    IGamificationRewardPort
{
  constructor(private readonly db: SqlExecutor) {}

  async findByUserId(userId: string): Promise<GamificationProfile | null> {
    const res = await this.db.query<ProfileRow>(
      `SELECT * FROM gamification_profiles WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    const row = res.rows[0];
    return row ? toDomainProfile(row) : null;
  }

  async save(profile: GamificationProfile): Promise<void> {
    const levelInfo = calculateLevel(profile.totalPoints);
    await this.db.query(
      `INSERT INTO gamification_profiles (
         user_id, total_points, current_level, badges_count, challenges_won, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET
         total_points = EXCLUDED.total_points,
         current_level = $3,
         badges_count = EXCLUDED.badges_count,
         challenges_won = EXCLUDED.challenges_won,
         updated_at = EXCLUDED.updated_at`,
      [
        profile.userId,
        profile.totalPoints,
        levelInfo.level,
        profile.badgesCount,
        profile.challengesWon,
        profile.updatedAt,
      ],
    );
  }

  async recordPoints(entry: PointsLedgerEntry): Promise<boolean> {
    const res = await this.db.query<{ id: string }>(
      `INSERT INTO gamification_points_ledger (
         id, user_id, points, source_type, source_id, description, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, source_type, source_id) DO NOTHING
       RETURNING id`,
      [
        entry.id,
        entry.userId,
        entry.points,
        entry.sourceType,
        entry.sourceId,
        entry.description,
        entry.createdAt,
      ],
    );

    if (res.rows.length > 0) {
      // Points were newly inserted; update profile totals
      await this.db.query(
        `INSERT INTO gamification_profiles (
           user_id, total_points, current_level, badges_count, challenges_won, updated_at
         ) VALUES ($1, $2, 1, 0, 0, now())
         ON CONFLICT (user_id) DO UPDATE SET
           total_points = gamification_profiles.total_points + $2,
           updated_at = now()`,
        [entry.userId, entry.points],
      );

      // Recalculate level
      const updatedProfile = await this.findByUserId(entry.userId);
      if (updatedProfile) {
        const levelInfo = calculateLevel(updatedProfile.totalPoints);
        if (levelInfo.level !== updatedProfile.currentLevel) {
          await this.db.query(
            `UPDATE gamification_profiles SET current_level = $1 WHERE user_id = $2`,
            [levelInfo.level, entry.userId],
          );
        }
      }
      return true;
    }

    return false;
  }

  async listByUser(userId: string, limit = 50): Promise<PointsLedgerEntry[]> {
    const res = await this.db.query<LedgerRow>(
      `SELECT * FROM gamification_points_ledger 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [userId, limit],
    );
    return res.rows.map(toDomainLedgerEntry);
  }

  async getTotalPoints(userId: string): Promise<number> {
    const res = await this.db.query<{ total: string | number }>(
      `SELECT COALESCE(SUM(points), 0)::int AS total 
       FROM gamification_points_ledger 
       WHERE user_id = $1`,
      [userId],
    );
    return Number(res.rows[0]?.total ?? 0);
  }

  /**
   * Executes atomic reward claim inside the active database transaction context.
   * Ensures idempotency:
   * 1. Marks enrollment claimed (fails if not completed or already claimed).
   * 2. Inserts reward into points ledger (ON CONFLICT DO NOTHING prevents duplicate rewards).
   * 3. Unlocks reward badge if applicable (ON CONFLICT DO NOTHING prevents duplicate badges).
   * 4. Updates profile total points, challenges won count, badge count, and level.
   */
  async executeAtomicRewardClaim(input: ClaimRewardTransactionInput): Promise<ClaimRewardTransactionResult> {
    const now = new Date();

    // 1. Lock and update enrollment: must be in status 'completed' and claimed_at IS NULL
    const enrollRes = await this.db.query<{ id: string; status: string; claimed_at: Date | null }>(
      `UPDATE challenge_enrollments
       SET status = 'claimed',
           claimed_at = $1,
           updated_at = $1
       WHERE user_id = $2
         AND occurrence_id = $3
         AND status = 'completed'
         AND claimed_at IS NULL
       RETURNING id, status, claimed_at`,
      [now, input.userId, input.occurrenceId],
    );

    if (enrollRes.rows.length === 0) {
      // Check why it was not updated: either not found/ineligible or already claimed
      const checkRes = await this.db.query<{ status: string; claimed_at: Date | null }>(
        `SELECT status, claimed_at FROM challenge_enrollments 
         WHERE user_id = $1 AND occurrence_id = $2 LIMIT 1`,
        [input.userId, input.occurrenceId],
      );
      const row = checkRes.rows[0];
      if (!row) {
        throw new IneligibleForRewardError('User is not enrolled in this occurrence.');
      }
      if (row.claimed_at !== null || row.status === 'claimed') {
        throw new RewardAlreadyClaimedError(input.occurrenceId);
      }
      throw new IneligibleForRewardError(`Enrollment status is "${row.status}", target not completed yet.`);
    }

    // 2. Insert into points ledger (idempotent ON CONFLICT)
    let pointsAwarded = 0;
    if (input.points > 0) {
      const ledgerRes = await this.db.query<{ id: string }>(
        `INSERT INTO gamification_points_ledger (
           id, user_id, points, source_type, source_id, description, created_at
         ) VALUES (gen_random_uuid(), $1, $2, 'challenge', $3, $4, $5)
         ON CONFLICT (user_id, source_type, source_id) DO NOTHING
         RETURNING id`,
        [input.userId, input.points, input.occurrenceId, input.description, now],
      );
      if (ledgerRes.rows.length > 0) {
        pointsAwarded = input.points;
      }
    }

    // 3. Unlock badge if applicable (idempotent ON CONFLICT)
    let badgeAwarded = false;
    if (input.badgeId) {
      const badgeRes = await this.db.query<{ id: string }>(
        `INSERT INTO user_badges (
           id, user_id, badge_id, earned_at, trigger_type, trigger_id, metadata
         ) VALUES (gen_random_uuid(), $1, $2, $3, 'challenge', $4, '{}')
         ON CONFLICT (user_id, badge_id) DO NOTHING
         RETURNING id`,
        [input.userId, input.badgeId, now, input.occurrenceId],
      );
      badgeAwarded = badgeRes.rows.length > 0;
    }

    // 4. Update profile aggregate totals
    const badgeIncrement = badgeAwarded ? 1 : 0;
    await this.db.query(
      `INSERT INTO gamification_profiles (
         user_id, total_points, current_level, badges_count, challenges_won, updated_at
       ) VALUES ($1, $2, 1, $3, 1, $4)
       ON CONFLICT (user_id) DO UPDATE SET
         total_points = gamification_profiles.total_points + $2,
         challenges_won = gamification_profiles.challenges_won + 1,
         badges_count = gamification_profiles.badges_count + $3,
         updated_at = $4`,
      [input.userId, pointsAwarded, badgeIncrement, now],
    );

    // 5. Query updated points and compute deterministic level
    const profile = await this.findByUserId(input.userId);
    const totalPoints = profile ? profile.totalPoints : pointsAwarded;
    const levelInfo = calculateLevel(totalPoints);

    if (profile && profile.currentLevel !== levelInfo.level) {
      await this.db.query(
        `UPDATE gamification_profiles SET current_level = $1 WHERE user_id = $2`,
        [levelInfo.level, input.userId],
      );
    }

    return {
      claimed: true,
      pointsAwarded,
      badgeAwarded,
      newTotalPoints: totalPoints,
      newLevel: levelInfo.level,
    };
  }
}

