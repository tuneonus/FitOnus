import { randomUUID } from 'node:crypto';
import type { SqlExecutor } from '../../../database/transaction.js';
import { Habit, type HabitCategory, type HabitFrequency } from '../domain/habit.js';
import type { StreakResult } from '../domain/streak-calculator.js';
import type { IHabitRepository, SetHabitCompletionInput } from '../application/ports.js';

interface HabitRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category: string;
  frequency: string;
  target_days_per_week: number;
  icon: string;
  color: string;
  current_streak: number;
  longest_streak: number;
  total_completions: number;
  is_archived: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

function toDomainHabit(row: HabitRow): Habit {
  return new Habit({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    category: row.category as HabitCategory,
    frequency: row.frequency as HabitFrequency,
    targetDaysPerWeek: row.target_days_per_week,
    icon: row.icon,
    color: row.color,
    currentStreak: row.current_streak,
    longestStreak: row.longest_streak,
    totalCompletions: row.total_completions,
    isArchived: row.is_archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  });
}

export class PgHabitRepository implements IHabitRepository {
  constructor(private readonly db: SqlExecutor) {}

  async save(habit: Habit): Promise<void> {
    await this.db.query(
      `INSERT INTO habits (
        id, user_id, title, description, category, frequency,
        target_days_per_week, icon, color, current_streak, longest_streak,
        total_completions, is_archived, created_at, updated_at, deleted_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        category = EXCLUDED.category,
        frequency = EXCLUDED.frequency,
        target_days_per_week = EXCLUDED.target_days_per_week,
        icon = EXCLUDED.icon,
        color = EXCLUDED.color,
        current_streak = EXCLUDED.current_streak,
        longest_streak = EXCLUDED.longest_streak,
        total_completions = EXCLUDED.total_completions,
        is_archived = EXCLUDED.is_archived,
        updated_at = NOW(),
        deleted_at = EXCLUDED.deleted_at
      WHERE habits.user_id = EXCLUDED.user_id`,
      [
        habit.id,
        habit.userId,
        habit.title,
        habit.description,
        habit.category,
        habit.frequency,
        habit.targetDaysPerWeek,
        habit.icon,
        habit.color,
        habit.currentStreak,
        habit.longestStreak,
        habit.totalCompletions,
        habit.isArchived,
        habit.createdAt,
        habit.updatedAt,
        habit.deletedAt,
      ],
    );
  }

  async findById(id: string, userId: string): Promise<Habit | null> {
    const res = await this.db.query<HabitRow>(
      `SELECT * FROM habits
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       LIMIT 1`,
      [id, userId],
    );
    if (!res.rows[0]) return null;
    return toDomainHabit(res.rows[0]);
  }

  async listByUser(userId: string, filter?: { isArchived?: boolean; category?: string }): Promise<Habit[]> {
    const conditions = ['user_id = $1', 'deleted_at IS NULL'];
    const values: unknown[] = [userId];

    if (filter?.isArchived !== undefined) {
      values.push(filter.isArchived);
      conditions.push(`is_archived = $${values.length}`);
    }

    if (filter?.category) {
      values.push(filter.category);
      conditions.push(`category = $${values.length}`);
    }

    const res = await this.db.query<HabitRow>(
      `SELECT * FROM habits
       WHERE ${conditions.join(' AND ')}
       ORDER BY is_archived ASC, created_at ASC`,
      values,
    );

    return res.rows.map(toDomainHabit);
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const res = await this.db.query(
      `UPDATE habits
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [id, userId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Explicitly sets habit completion state for a given day.
   * Idempotent: repeated calls with completed: true will safely no-op via ON CONFLICT.
   * Repeated calls with completed: false will safely remove the record.
   */
  async setCompletion(input: SetHabitCompletionInput): Promise<boolean> {
    const completionId = input.id ?? randomUUID();

    if (input.completed) {
      await this.db.query(
        `INSERT INTO habit_completions (
          id, habit_id, user_id, date, completed_at, notes
        ) VALUES ($1, $2, $3, $4, NOW(), $5)
        ON CONFLICT (habit_id, date) DO NOTHING`,
        [completionId, input.habitId, input.userId, input.date, input.notes ?? null],
      );
      return true;
    } else {
      const res = await this.db.query(
        `DELETE FROM habit_completions
         WHERE habit_id = $1 AND user_id = $2 AND date = $3`,
        [input.habitId, input.userId, input.date],
      );
      return (res.rowCount ?? 0) > 0;
    }
  }

  async isCompleted(habitId: string, date: string): Promise<boolean> {
    const res = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM habit_completions
         WHERE habit_id = $1 AND date = $2
       ) AS exists`,
      [habitId, date],
    );
    return Boolean(res.rows[0]?.exists);
  }

  async getCompletionDates(habitId: string, userId: string, limitDays: number = 365): Promise<string[]> {
    const res = await this.db.query<{ date: string }>(
      `SELECT date::text
       FROM habit_completions
       WHERE habit_id = $1 AND user_id = $2
       ORDER BY date ASC
       LIMIT $3`,
      [habitId, userId, limitDays],
    );

    return res.rows.map((r) => String(r.date).slice(0, 10));
  }

  async getCompletionsForDate(userId: string, date: string): Promise<string[]> {
    const res = await this.db.query<{ habit_id: string }>(
      `SELECT habit_id
       FROM habit_completions
       WHERE user_id = $1 AND date = $2`,
      [userId, date],
    );

    return res.rows.map((r) => r.habit_id);
  }

  async updateStreaks(habitId: string, userId: string, streaks: StreakResult): Promise<void> {
    await this.db.query(
      `UPDATE habits
       SET current_streak = $1,
           longest_streak = GREATEST(longest_streak, $2),
           total_completions = $3,
           updated_at = NOW()
       WHERE id = $4 AND user_id = $5`,
      [streaks.currentStreak, streaks.longestStreak, streaks.totalCompletions, habitId, userId],
    );
  }
}
