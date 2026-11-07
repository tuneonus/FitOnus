/**
 * Analytics Application Ports & Repository Interfaces
 *
 * Defines boundaries for database adapters querying existing FitOnus tables.
 */

import type {
  RawWorkoutSessionRecord,
  RawExerciseSetRecord,
  RawExercisePrRecord,
} from '../domain/workout-metrics.js';
import type { RawMealAggregateRecord } from '../domain/nutrition-metrics.js';
import type { RawWaterAggregateRecord } from '../domain/hydration-metrics.js';
import type { RawWeightLogRecord, RawMeasurementRecord } from '../domain/body-analytics-metrics.js';
import type { RawGoalRecord, RawHabitRecord } from '../domain/goals-habits-metrics.js';

export interface UserProfileAnalyticsGoals {
  primaryGoal: string | null;
  startingWeightKg: number | null;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  dailyCalorieTarget: number | null;
  dailyProteinGrams: number | null;
  workoutDaysPerWeek: number | null;
}

export interface IAnalyticsWorkoutRepository {
  /**
   * Retrieves completed workout sessions for a user within a UTC date range.
   */
  getCompletedSessions(userId: string, startUtc: Date, endUtc: Date): Promise<RawWorkoutSessionRecord[]>;

  /**
   * Retrieves historical sets for a specific exercise within a UTC date range.
   */
  getExerciseSetsHistory(
    userId: string,
    exerciseId: string,
    startUtc: Date,
    endUtc: Date,
  ): Promise<RawExerciseSetRecord[]>;

  /**
   * Retrieves the current personal record for an exercise.
   */
  getExerciseCurrentPr(userId: string, exerciseId: string): Promise<RawExercisePrRecord | null>;
}

export interface IAnalyticsNutritionRepository {
  /**
   * Retrieves daily aggregated meals for a user across a local calendar date range (YYYY-MM-DD).
   */
  getDailyMealAggregates(
    userId: string,
    startDateStr: string,
    endDateStr: string,
  ): Promise<RawMealAggregateRecord[]>;

  /**
   * Retrieves daily aggregated water intake across a local calendar date range (YYYY-MM-DD).
   */
  getDailyWaterAggregates(
    userId: string,
    startDateStr: string,
    endDateStr: string,
  ): Promise<RawWaterAggregateRecord[]>;
}

export interface IAnalyticsBodyRepository {
  /**
   * Retrieves chronological body weight logs for a user within a UTC date range.
   */
  getWeightLogs(userId: string, startUtc: Date, endUtc: Date): Promise<RawWeightLogRecord[]>;

  /**
   * Retrieves chronological body measurements for a user within a UTC date range.
   */
  getMeasurements(userId: string, startUtc: Date, endUtc: Date): Promise<RawMeasurementRecord[]>;

  /**
   * Retrieves profile targets (starting weight, goal weight, calories, protein, workout frequency).
   */
  getUserProfileGoals(userId: string): Promise<UserProfileAnalyticsGoals | null>;
}

export interface IAnalyticsGoalsHabitsRepository {
  /**
   * Retrieves all active/completed goals for a user.
   */
  getGoals(userId: string): Promise<RawGoalRecord[]>;

  /**
   * Retrieves active habits along with completion dates recorded within the calendar window.
   */
  getHabitsWithCompletions(
    userId: string,
    startDateStr: string,
    endDateStr: string,
  ): Promise<RawHabitRecord[]>;
}
