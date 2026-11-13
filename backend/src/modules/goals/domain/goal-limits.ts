import { AppError } from '../../../shared/errors/app-error.js';
import { isValidCalendarDate } from './local-date.js';

/**
 * Write-path limits for goals, checkpoints and habits.
 *
 * Every limit is chosen from the domain first ("what could a person legitimately track?") and is then
 * checked to sit STRICTLY inside the capacity of the column it ends up in (migration 0010):
 *
 *   goals.start_value / current_value / target_value, goal_checkpoints.value   numeric(10,2) -> |x| < 100,000,000
 *   goals.title varchar(150), metric_unit varchar(30), deadline_label varchar(50)
 *   goal_checkpoints.source varchar(30)
 *   habits.title varchar(150), icon varchar(50), color varchar(30)
 *   habits.target_days_per_week smallint CHECK 1..7
 *
 * `tests/unit/goals/goal-limits.test.ts` pins the "strictly inside the column" relation so a future change to
 * a limit cannot silently re-introduce a PostgreSQL "numeric field overflow".
 *
 * The limits are deliberately NOT enforced when rows are hydrated from the database (older rows may predate
 * them); they guard values that are about to be written.
 */

/** Exclusive capacity of numeric(10,2). */
export const NUMERIC_10_2_CAPACITY = 100_000_000;

/**
 * Largest value a goal or checkpoint may hold. The biggest legitimate metrics are daily steps (tens of
 * thousands), distances in metres (a marathon is 42,195) and cumulative counters, so 1,000,000 leaves
 * generous headroom while staying 100x below the column capacity.
 */
export const GOAL_VALUE_MAX = 1_000_000;

export const GOAL_TITLE_MAX_LENGTH = 150;
export const GOAL_METRIC_UNIT_MAX_LENGTH = 30;
export const GOAL_DEADLINE_LABEL_MAX_LENGTH = 50;
export const CHECKPOINT_SOURCE_MAX_LENGTH = 30;
export const HABIT_TITLE_MAX_LENGTH = 150;
export const HABIT_ICON_MAX_LENGTH = 50;
export const HABIT_COLOR_MAX_LENGTH = 30;

export const HABIT_TARGET_DAYS_MIN = 1;
export const HABIT_TARGET_DAYS_MAX = 7;

function invalid(message: string, details?: Record<string, unknown>): AppError {
  return new AppError('unprocessable', 'VALIDATION_FAILED', message, details);
}

/** A goal / checkpoint value: finite, non-negative and at most {@link GOAL_VALUE_MAX}. */
export function assertGoalValue(field: string, value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalid(`${field} must be a finite number`, { field });
  }
  if (value < 0) {
    throw invalid(`${field} cannot be negative`, { field, min: 0 });
  }
  if (value > GOAL_VALUE_MAX) {
    throw invalid(`${field} cannot exceed ${GOAL_VALUE_MAX}`, { field, max: GOAL_VALUE_MAX });
  }
}

export function assertMaxLength(field: string, value: string | null | undefined, max: number): void {
  if (value !== null && value !== undefined && value.length > max) {
    throw invalid(`${field} cannot exceed ${max} characters`, { field, max });
  }
}

export function assertCalendarDate(field: string, value: string | null | undefined): void {
  if (value === null || value === undefined) return;
  if (!isValidCalendarDate(value)) {
    throw invalid(`${field} must be a valid calendar date formatted as YYYY-MM-DD`, { field });
  }
}

export function assertHabitTargetDays(value: number): void {
  if (!Number.isInteger(value) || value < HABIT_TARGET_DAYS_MIN || value > HABIT_TARGET_DAYS_MAX) {
    throw invalid(
      `targetDaysPerWeek must be a whole number between ${HABIT_TARGET_DAYS_MIN} and ${HABIT_TARGET_DAYS_MAX}`,
      {
        field: 'targetDaysPerWeek',
      },
    );
  }
}

/** Clamps a value computed from telemetry (sums of other tables) into the writable range. */
export function clampGoalValue(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(value, GOAL_VALUE_MAX);
}
