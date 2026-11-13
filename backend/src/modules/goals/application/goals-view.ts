import type { Goal, GoalType, GoalCadence, GoalDirection, GoalStatus } from '../domain/goal.js';
import type { Habit, HabitCategory, HabitFrequency } from '../domain/habit.js';
import type { GoalCheckpoint } from '../domain/goal-checkpoint.js';
import type { StreakResult } from '../domain/streak-calculator.js';
import { isGoalOverdue, localDateString } from '../domain/local-date.js';

export interface GoalView {
  id: string;
  userId: string;
  type: GoalType;
  title: string;
  description: string | null;
  unit: string;
  start: number;
  current: number;
  target: number;
  progress: number;
  cadence: GoalCadence;
  direction: GoalDirection;
  status: GoalStatus;
  isPrimary: boolean;
  deadline: string;
  targetDate: string | null;
  completedOn: string | null;
  /** Active goal whose target date has passed in the user's local calendar. Only set when `today` is known. */
  isOverdue?: boolean;
  hitDays?: number;
  history: number[];
  createdAt: string;
  updatedAt: string;
}

export interface GoalViewOptions {
  history?: number[];
  hitDays?: number;
  /** IANA timezone used to express `completedOn` as the user's local calendar date (UTC when absent). */
  timeZone?: string | null;
  /** The user's local "today" (`YYYY-MM-DD`); enables the overdue evaluation. */
  today?: string;
}

export function toGoalView(goal: Goal, options?: GoalViewOptions): GoalView {
  return {
    id: goal.id,
    userId: goal.userId,
    type: goal.type,
    title: goal.title,
    description: goal.description,
    unit: goal.metricUnit,
    start: goal.startValue,
    current: goal.currentValue,
    target: goal.targetValue,
    progress: goal.progress,
    cadence: goal.cadence,
    direction: goal.direction,
    status: goal.status,
    isPrimary: goal.isPrimary,
    deadline: goal.deadlineLabel,
    targetDate: goal.targetDate,
    completedOn: goal.completedAt ? localDateString(goal.completedAt, options?.timeZone) : null,
    ...(options?.today !== undefined ? { isOverdue: isGoalOverdue(goal, options.today) } : {}),
    hitDays: options?.hitDays,
    history:
      options?.history ??
      (goal.cadence === 'once' ? [goal.startValue, goal.currentValue] : [goal.currentValue]),
    createdAt: goal.createdAt.toISOString(),
    updatedAt: goal.updatedAt.toISOString(),
  };
}

export interface GoalCheckpointView {
  id: string;
  goalId: string;
  value: number;
  date: string;
  recordedAt: string;
  source: string;
  notes: string | null;
}

export function toCheckpointView(cp: GoalCheckpoint): GoalCheckpointView {
  return {
    id: cp.id,
    goalId: cp.goalId,
    value: cp.value,
    date: cp.date,
    recordedAt: cp.recordedAt.toISOString(),
    source: cp.source,
    notes: cp.notes,
  };
}

export interface GoalDetailsView {
  goal: GoalView;
  checkpoints: GoalCheckpointView[];
  recentHistory: number[];
}

export interface HabitView {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  category: HabitCategory;
  frequency: HabitFrequency;
  targetDaysPerWeek: number;
  icon: string;
  color: string;
  currentStreak: number;
  longestStreak: number;
  totalCompletions: number;
  isCompletedToday: boolean;
  isArchived: boolean;
  weeklyProgress?: {
    completedDays: number;
    targetDays: number;
    percentage: number;
  };
  createdAt: string;
  updatedAt: string;
}

export function toHabitView(
  habit: Habit,
  options?: { isCompletedToday?: boolean; weeklyCompletedDays?: number },
): HabitView {
  const isCompletedToday = Boolean(options?.isCompletedToday);
  const targetDays = habit.targetDaysPerWeek;
  const completedDays = options?.weeklyCompletedDays ?? 0;

  return {
    id: habit.id,
    userId: habit.userId,
    title: habit.title,
    description: habit.description,
    category: habit.category,
    frequency: habit.frequency,
    targetDaysPerWeek: targetDays,
    icon: habit.icon,
    color: habit.color,
    currentStreak: habit.currentStreak,
    longestStreak: habit.longestStreak,
    totalCompletions: habit.totalCompletions,
    isCompletedToday,
    isArchived: habit.isArchived,
    weeklyProgress: {
      completedDays,
      targetDays,
      percentage: Math.min(100, Math.round((completedDays / targetDays) * 100)),
    },
    createdAt: habit.createdAt.toISOString(),
    updatedAt: habit.updatedAt.toISOString(),
  };
}

export interface HabitHistoryView {
  habit: HabitView;
  completionDates: string[];
  streaks: StreakResult;
}
