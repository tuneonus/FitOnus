/**
 * PostgreSQL Analytics Goals & Habits Repository Adapter
 *
 * Implements index-optimized, parameterized queries over goals,
 * habits, and habit_completions.
 */

import type { SqlExecutor } from '../../../database/transaction.js';
import type { IAnalyticsGoalsHabitsRepository } from '../application/ports.js';
import type { RawGoalRecord, RawHabitRecord } from '../domain/goals-habits-metrics.js';

export class PgAnalyticsGoalsHabitsRepository implements IAnalyticsGoalsHabitsRepository {
  constructor(private readonly db: SqlExecutor) {}

  async getGoals(userId: string): Promise<RawGoalRecord[]> {
    const res = await this.db.query<{
      id: string;
      type: string;
      title: string;
      start_value: string | number;
      current_value: string | number;
      target_value: string | number;
      status: string;
      target_date: string | null;
      completed_at: Date | null;
    }>(
      `SELECT id, type, title, start_value, current_value, target_value,
              status, target_date::text AS target_date, completed_at
       FROM goals
       WHERE user_id = $1
         AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [userId],
    );

    return res.rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      startValue: Number(r.start_value),
      currentValue: Number(r.current_value),
      targetValue: Number(r.target_value),
      status: r.status,
      targetDate: r.target_date ? r.target_date.slice(0, 10) : null,
      completedAt: r.completed_at ? new Date(r.completed_at) : null,
    }));
  }

  async getHabitsWithCompletions(
    userId: string,
    startDateStr: string,
    endDateStr: string,
  ): Promise<RawHabitRecord[]> {
    const res = await this.db.query<{
      id: string;
      title: string;
      category: string;
      frequency: string;
      target_days_per_week: number;
      current_streak: number;
      longest_streak: number;
      total_completions: number;
      completion_dates: string[] | null;
    }>(
      `SELECT
         h.id,
         h.title,
         h.category,
         h.frequency,
         h.target_days_per_week,
         h.current_streak,
         h.longest_streak,
         h.total_completions,
         COALESCE(
           ARRAY_AGG(hc.date::text ORDER BY hc.date ASC) FILTER (WHERE hc.date IS NOT NULL),
           '{}'
         ) AS completion_dates
       FROM habits h
       LEFT JOIN habit_completions hc
         ON hc.habit_id = h.id
        AND hc.user_id = $1
        AND hc.date >= $2::date
        AND hc.date <= $3::date
       WHERE h.user_id = $1
         AND h.is_archived = false
         AND h.deleted_at IS NULL
       GROUP BY h.id
       ORDER BY h.created_at ASC`,
      [userId, startDateStr, endDateStr],
    );

    return res.rows.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      frequency: r.frequency,
      targetDaysPerWeek: Number(r.target_days_per_week),
      currentStreak: Number(r.current_streak),
      longestStreak: Number(r.longest_streak),
      totalCompletions: Number(r.total_completions),
      completionDates: (r.completion_dates ?? []).map((d) => d.slice(0, 10)),
    }));
  }
}
