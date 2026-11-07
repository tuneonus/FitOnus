import type { SqlExecutor } from '../../../database/transaction.js';
import type { IWeightRepository, UserWeightSummary, WeightFilter } from '../application/ports.js';
import { WeightLog, type WeightSource } from '../domain/weight-log.js';

interface WeightRow {
  id: string;
  user_id: string;
  weight_kg: string | number;
  logged_at: Date;
  source: WeightSource;
  notes: string | null;
  client_id: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

interface ProfileSummaryRow {
  current_weight_kg: string | number | null;
  starting_weight_kg: string | number | null;
  target_weight_kg: string | number | null;
  latest_logged_at: Date | null;
  total_logs_count: number | string;
}

function toDomain(row: WeightRow): WeightLog {
  return new WeightLog({
    id: row.id,
    userId: row.user_id,
    weightKg: Number(row.weight_kg),
    loggedAt: row.logged_at,
    source: row.source,
    notes: row.notes,
    clientId: row.client_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  });
}

export class PgWeightRepository implements IWeightRepository {
  constructor(private readonly db: SqlExecutor) {}

  async save(log: WeightLog): Promise<{ log: WeightLog; isNew: boolean }> {
    if (log.clientId) {
      // Idempotent insertion using client_id
      const insertQuery = `
        INSERT INTO weight_logs (
          id, user_id, weight_kg, logged_at, source, notes, client_id, created_at, updated_at, deleted_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (user_id, client_id) DO NOTHING
        RETURNING *;
      `;
      const res = await this.db.query<WeightRow>(insertQuery, [
        log.id,
        log.userId,
        log.weightKg,
        log.loggedAt,
        log.source,
        log.notes,
        log.clientId,
        log.createdAt,
        log.updatedAt,
        log.deletedAt,
      ]);

      if (res.rows.length > 0) {
        return { log: toDomain(res.rows[0]!), isNew: true };
      }

      // Conflict occurred on (user_id, client_id); retrieve existing record
      const existing = await this.findByClientId(log.clientId, log.userId);
      if (existing) {
        return { log: existing, isNew: false };
      }
    }

    // No client_id, or updating by primary key
    const upsertQuery = `
      INSERT INTO weight_logs (
        id, user_id, weight_kg, logged_at, source, notes, client_id, created_at, updated_at, deleted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        weight_kg = EXCLUDED.weight_kg,
        logged_at = EXCLUDED.logged_at,
        source = EXCLUDED.source,
        notes = EXCLUDED.notes,
        updated_at = NOW(),
        deleted_at = EXCLUDED.deleted_at
      RETURNING *;
    `;
    const res = await this.db.query<WeightRow>(upsertQuery, [
      log.id,
      log.userId,
      log.weightKg,
      log.loggedAt,
      log.source,
      log.notes,
      log.clientId,
      log.createdAt,
      log.updatedAt,
      log.deletedAt,
    ]);

    return { log: toDomain(res.rows[0]!), isNew: true };
  }

  async update(
    id: string,
    userId: string,
    patch: { weightKg?: number; loggedAt?: Date; notes?: string | null; source?: WeightSource },
  ): Promise<WeightLog | null> {
    const existing = await this.findById(id, userId);
    if (!existing) return null;

    const updatedLog = new WeightLog({
      id: existing.id,
      userId: existing.userId,
      weightKg: patch.weightKg !== undefined ? patch.weightKg : existing.weightKg,
      loggedAt: patch.loggedAt !== undefined ? patch.loggedAt : existing.loggedAt,
      source: patch.source !== undefined ? patch.source : existing.source,
      notes: patch.notes !== undefined ? patch.notes : existing.notes,
      clientId: existing.clientId,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
      deletedAt: existing.deletedAt,
    });

    const query = `
      UPDATE weight_logs
      SET weight_kg = $1, logged_at = $2, source = $3, notes = $4, updated_at = NOW()
      WHERE id = $5 AND user_id = $6 AND deleted_at IS NULL
      RETURNING *;
    `;
    const res = await this.db.query<WeightRow>(query, [
      updatedLog.weightKg,
      updatedLog.loggedAt,
      updatedLog.source,
      updatedLog.notes,
      id,
      userId,
    ]);

    return res.rows[0] ? toDomain(res.rows[0]) : null;
  }

  async findById(id: string, userId: string): Promise<WeightLog | null> {
    const res = await this.db.query<WeightRow>(
      `SELECT * FROM weight_logs WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [id, userId],
    );
    return res.rows[0] ? toDomain(res.rows[0]) : null;
  }

  async findByClientId(clientId: string, userId: string): Promise<WeightLog | null> {
    const res = await this.db.query<WeightRow>(
      `SELECT * FROM weight_logs WHERE client_id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [clientId, userId],
    );
    return res.rows[0] ? toDomain(res.rows[0]) : null;
  }

  async listForUser(userId: string, filter?: WeightFilter): Promise<{ logs: WeightLog[]; total: number }> {
    const conditions: string[] = ['user_id = $1'];
    const values: unknown[] = [userId];
    let paramIndex = 2;

    if (!filter?.includeDeleted) {
      conditions.push('deleted_at IS NULL');
    }

    if (filter?.startDate) {
      conditions.push(`logged_at >= $${paramIndex++}`);
      values.push(filter.startDate);
    }

    if (filter?.endDate) {
      conditions.push(`logged_at <= $${paramIndex++}`);
      values.push(filter.endDate);
    }

    const whereClause = conditions.join(' AND ');

    // Total count
    const countRes = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM weight_logs WHERE ${whereClause}`,
      values,
    );
    const total = Number(countRes.rows[0]?.count ?? 0);

    const limit = Math.min(Math.max(filter?.limit ?? 50, 1), 500);
    const offset = Math.max(filter?.offset ?? 0, 0);

    const dataQuery = `
      SELECT * FROM weight_logs 
      WHERE ${whereClause}
      ORDER BY logged_at DESC, created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;
    const dataValues = [...values, limit, offset];

    const dataRes = await this.db.query<WeightRow>(dataQuery, dataValues);
    return {
      logs: dataRes.rows.map(toDomain),
      total,
    };
  }

  async getLatestForUser(userId: string): Promise<WeightLog | null> {
    const res = await this.db.query<WeightRow>(
      `SELECT * FROM weight_logs 
       WHERE user_id = $1 AND deleted_at IS NULL 
       ORDER BY logged_at DESC, created_at DESC 
       LIMIT 1`,
      [userId],
    );
    return res.rows[0] ? toDomain(res.rows[0]) : null;
  }

  async getEarliestForUser(userId: string): Promise<WeightLog | null> {
    const res = await this.db.query<WeightRow>(
      `SELECT * FROM weight_logs 
       WHERE user_id = $1 AND deleted_at IS NULL 
       ORDER BY logged_at ASC, created_at ASC 
       LIMIT 1`,
      [userId],
    );
    return res.rows[0] ? toDomain(res.rows[0]) : null;
  }

  async getUserWeightSummary(userId: string): Promise<UserWeightSummary> {
    const summaryQuery = `
      SELECT 
        p.current_weight_kg,
        p.starting_weight_kg,
        p.target_weight_kg,
        (
          SELECT MAX(logged_at) 
          FROM weight_logs 
          WHERE user_id = $1 AND deleted_at IS NULL
        ) AS latest_logged_at,
        (
          SELECT COUNT(*)::int 
          FROM weight_logs 
          WHERE user_id = $1 AND deleted_at IS NULL
        ) AS total_logs_count
      FROM user_profiles p
      WHERE p.user_id = $1
      LIMIT 1;
    `;
    const res = await this.db.query<ProfileSummaryRow>(summaryQuery, [userId]);

    if (res.rows[0]) {
      const row = res.rows[0];
      return {
        currentWeightKg: row.current_weight_kg !== null ? Number(row.current_weight_kg) : null,
        startingWeightKg: row.starting_weight_kg !== null ? Number(row.starting_weight_kg) : null,
        targetWeightKg: row.target_weight_kg !== null ? Number(row.target_weight_kg) : null,
        latestLoggedAt: row.latest_logged_at,
        totalLogsCount: Number(row.total_logs_count),
      };
    }

    // Graceful fallback if user_profiles does not exist yet for user
    const fallbackQuery = `
      SELECT 
        MAX(logged_at) AS latest_logged_at,
        COUNT(*)::int AS total_logs_count
      FROM weight_logs 
      WHERE user_id = $1 AND deleted_at IS NULL;
    `;
    const fallbackRes = await this.db.query<{
      latest_logged_at: Date | null;
      total_logs_count: number | string;
    }>(fallbackQuery, [userId]);
    const fb = fallbackRes.rows[0];
    return {
      currentWeightKg: null,
      startingWeightKg: null,
      targetWeightKg: null,
      latestLoggedAt: fb?.latest_logged_at ?? null,
      totalLogsCount: Number(fb?.total_logs_count ?? 0),
    };
  }

  async softDelete(id: string, userId: string): Promise<boolean> {
    const res = await this.db.query<{ id: string }>(
      `UPDATE weight_logs 
       SET deleted_at = NOW(), updated_at = NOW() 
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL 
       RETURNING id`,
      [id, userId],
    );
    return res.rows.length > 0;
  }

  async hardDelete(id: string, userId: string): Promise<boolean> {
    const res = await this.db.query<{ id: string }>(
      `DELETE FROM weight_logs WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId],
    );
    return res.rows.length > 0;
  }
}
