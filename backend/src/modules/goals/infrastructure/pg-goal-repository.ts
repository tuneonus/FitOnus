import type { SqlExecutor } from '../../../database/transaction.js';
import {
  Goal,
  type GoalCadence,
  type GoalDirection,
  type GoalStatus,
  type GoalType,
  type TelemetrySource,
} from '../domain/goal.js';
import { GoalCheckpoint } from '../domain/goal-checkpoint.js';
import type { IGoalRepository } from '../application/ports.js';

interface GoalRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  description: string | null;
  metric_unit: string;
  start_value: string | number;
  current_value: string | number;
  target_value: string | number;
  cadence: string;
  direction: string;
  status: string;
  is_primary: boolean;
  deadline_label: string;
  target_date: string | null;
  completed_at: Date | null;
  telemetry_source: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

interface CheckpointRow {
  id: string;
  goal_id: string;
  user_id: string;
  value: string | number;
  date: string | Date;
  recorded_at: Date;
  source: string;
  notes: string | null;
}

function formatDate(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) {
    const year = val.getFullYear();
    const month = String(val.getMonth() + 1).padStart(2, '0');
    const day = String(val.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (typeof val === 'string' || typeof val === 'number') {
    const s = String(val);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  }
  return null;
}

function toDomainGoal(row: GoalRow): Goal {
  return new Goal({
    id: row.id,
    userId: row.user_id,
    type: row.type as GoalType,
    title: row.title,
    description: row.description,
    metricUnit: row.metric_unit,
    startValue: Number(row.start_value),
    currentValue: Number(row.current_value),
    targetValue: Number(row.target_value),
    cadence: row.cadence as GoalCadence,
    direction: row.direction as GoalDirection,
    status: row.status as GoalStatus,
    isPrimary: row.is_primary,
    deadlineLabel: row.deadline_label,
    targetDate: formatDate(row.target_date),
    completedAt: row.completed_at,
    telemetrySource: row.telemetry_source as TelemetrySource | null,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  });
}

export class PgGoalRepository implements IGoalRepository {
  constructor(private readonly db: SqlExecutor) {}

  async save(goal: Goal): Promise<void> {
    if (goal.isPrimary) {
      await this.clearPrimary(goal.userId);
    }

    await this.db.query(
      `INSERT INTO goals (
        id, user_id, type, title, description, metric_unit,
        start_value, current_value, target_value, cadence, direction,
        status, is_primary, deadline_label, target_date, completed_at,
        telemetry_source, metadata, created_at, updated_at, deleted_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21
      )
      ON CONFLICT (id) DO UPDATE SET
        type = EXCLUDED.type,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        metric_unit = EXCLUDED.metric_unit,
        start_value = EXCLUDED.start_value,
        current_value = EXCLUDED.current_value,
        target_value = EXCLUDED.target_value,
        cadence = EXCLUDED.cadence,
        direction = EXCLUDED.direction,
        status = EXCLUDED.status,
        is_primary = EXCLUDED.is_primary,
        deadline_label = EXCLUDED.deadline_label,
        target_date = EXCLUDED.target_date,
        completed_at = EXCLUDED.completed_at,
        telemetry_source = EXCLUDED.telemetry_source,
        metadata = EXCLUDED.metadata,
        updated_at = NOW(),
        deleted_at = EXCLUDED.deleted_at
      WHERE goals.user_id = EXCLUDED.user_id`,
      [
        goal.id,
        goal.userId,
        goal.type,
        goal.title,
        goal.description,
        goal.metricUnit,
        goal.startValue,
        goal.currentValue,
        goal.targetValue,
        goal.cadence,
        goal.direction,
        goal.status,
        goal.isPrimary,
        goal.deadlineLabel,
        goal.targetDate,
        goal.completedAt,
        goal.telemetrySource,
        JSON.stringify(goal.metadata),
        goal.createdAt,
        goal.updatedAt,
        goal.deletedAt,
      ],
    );
  }

  async findById(id: string, userId: string): Promise<Goal | null> {
    const res = await this.db.query<GoalRow>(
      `SELECT * FROM goals 
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       LIMIT 1`,
      [id, userId],
    );
    if (!res.rows[0]) return null;
    return toDomainGoal(res.rows[0]);
  }

  async listByUser(userId: string, filter?: { status?: GoalStatus; isPrimary?: boolean }): Promise<Goal[]> {
    const conditions = ['user_id = $1', 'deleted_at IS NULL'];
    const values: unknown[] = [userId];

    if (filter?.status) {
      values.push(filter.status);
      conditions.push(`status = $${values.length}`);
    }

    if (filter?.isPrimary !== undefined) {
      values.push(filter.isPrimary);
      conditions.push(`is_primary = $${values.length}`);
    }

    const res = await this.db.query<GoalRow>(
      `SELECT * FROM goals 
       WHERE ${conditions.join(' AND ')}
       ORDER BY is_primary DESC, created_at DESC`,
      values,
    );

    return res.rows.map(toDomainGoal);
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const res = await this.db.query(
      `UPDATE goals 
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [id, userId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async clearPrimary(userId: string): Promise<void> {
    await this.db.query(
      `UPDATE goals 
       SET is_primary = false, updated_at = NOW()
       WHERE user_id = $1 AND is_primary = true AND deleted_at IS NULL`,
      [userId],
    );
  }

  async addCheckpoint(checkpoint: GoalCheckpoint): Promise<void> {
    await this.db.query(
      `INSERT INTO goal_checkpoints (
        id, goal_id, user_id, value, date, recorded_at, source, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        checkpoint.id,
        checkpoint.goalId,
        checkpoint.userId,
        checkpoint.value,
        checkpoint.date,
        checkpoint.recordedAt,
        checkpoint.source,
        checkpoint.notes,
      ],
    );
  }

  async getCheckpoints(goalId: string, userId: string, limit: number = 20): Promise<GoalCheckpoint[]> {
    const res = await this.db.query<CheckpointRow>(
      `SELECT * FROM goal_checkpoints
       WHERE goal_id = $1 AND user_id = $2
       ORDER BY date DESC, recorded_at DESC
       LIMIT $3`,
      [goalId, userId, limit],
    );

    return res.rows.map(
      (r) =>
        new GoalCheckpoint({
          id: r.id,
          goalId: r.goal_id,
          userId: r.user_id,
          value: Number(r.value),
          date: formatDate(r.date) ?? formatDate(r.recorded_at) ?? '1970-01-01',
          recordedAt: r.recorded_at,
          source: r.source,
          notes: r.notes,
        }),
    );
  }

  async getRecentValues(goalId: string, userId: string, limit: number = 10): Promise<number[]> {
    const res = await this.db.query<{ value: string | number }>(
      `SELECT value FROM (
         SELECT value, date, recorded_at
         FROM goal_checkpoints
         WHERE goal_id = $1 AND user_id = $2
         ORDER BY date DESC, recorded_at DESC
         LIMIT $3
       ) sub
       ORDER BY date ASC, recorded_at ASC`,
      [goalId, userId, limit],
    );

    return res.rows.map((r) => Number(r.value));
  }
}
