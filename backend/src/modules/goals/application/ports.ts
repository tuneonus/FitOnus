import type { Goal, GoalStatus } from '../domain/goal.js';
import type { GoalCheckpoint } from '../domain/goal-checkpoint.js';
import type { Habit } from '../domain/habit.js';
import type { StreakResult } from '../domain/streak-calculator.js';

export interface ProfileGoalsSummary {
  primaryGoal: string | null;
  targetWeightKg: number | null;
  startingWeightKg: number | null;
  currentWeightKg: number | null;
  dailyCalorieTarget: number | null;
  dailyProteinGrams: number | null;
  workoutDaysPerWeek: number | null;
}

export interface IGoalRepository {
  save(goal: Goal): Promise<void>;
  findById(id: string, userId: string): Promise<Goal | null>;
  listByUser(userId: string, filter?: { status?: GoalStatus; isPrimary?: boolean }): Promise<Goal[]>;
  delete(id: string, userId: string): Promise<boolean>;
  addCheckpoint(checkpoint: GoalCheckpoint): Promise<void>;
  getCheckpoints(goalId: string, userId: string, limit?: number): Promise<GoalCheckpoint[]>;
  getRecentValues(goalId: string, userId: string, limit?: number): Promise<number[]>;
  clearPrimary(userId: string): Promise<void>;
}

export interface SetHabitCompletionInput {
  id?: string;
  habitId: string;
  userId: string;
  date: string; // YYYY-MM-DD
  completed: boolean; // Explicit state: true = record completion, false = remove completion
  notes?: string | null;
}

export interface IHabitRepository {
  save(habit: Habit): Promise<void>;
  findById(id: string, userId: string): Promise<Habit | null>;
  listByUser(userId: string, filter?: { isArchived?: boolean; category?: string }): Promise<Habit[]>;
  delete(id: string, userId: string): Promise<boolean>;
  setCompletion(input: SetHabitCompletionInput): Promise<boolean>;
  isCompleted(habitId: string, date: string): Promise<boolean>;
  getCompletionDates(habitId: string, userId: string, limitDays?: number): Promise<string[]>;
  getCompletionsForDate(userId: string, date: string): Promise<string[]>;
  updateStreaks(habitId: string, userId: string, streaks: StreakResult): Promise<void>;
}

export interface IGoalsTelemetryPort {
  getProfileGoals(userId: string): Promise<ProfileGoalsSummary | null>;
  getLatestWeight(userId: string): Promise<number | null>;
  getDailyWaterIntakeLiters(userId: string, date: string): Promise<number>;
  getDailyNutrition(userId: string, date: string): Promise<{ calories: number; proteinG: number }>;
  /** `weekStart` is inclusive, `weekEnd` is the last instant of the week (both are real instants). */
  getWeeklyWorkoutCount(userId: string, weekStart: Date, weekEnd: Date): Promise<number>;
  /** Workout days are bucketed in `timeZone` (UTC when omitted); `referenceDateStr` is the user's local today. */
  getWorkoutStreak(userId: string, referenceDateStr?: string, timeZone?: string): Promise<number>;
  /** Daily totals for the `days` days up to `referenceDate` (the user's local today; UTC today when omitted). */
  getRecentDailyWaterLiters(userId: string, days: number, referenceDate?: string): Promise<number[]>;
  getRecentDailyProteinGrams(userId: string, days: number, referenceDate?: string): Promise<number[]>;
}
