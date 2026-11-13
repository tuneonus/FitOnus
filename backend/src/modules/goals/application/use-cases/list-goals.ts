import type { Goal, GoalStatus } from '../../domain/goal.js';
import { clampGoalValue } from '../../domain/goal-limits.js';
import {
  localWeekInstants,
  resolveTimeZone,
  systemClock,
  todayInTimeZone,
  type Clock,
} from '../../domain/local-date.js';
import type { IGoalRepository, IGoalsTelemetryPort } from '../ports.js';
import { toGoalView, type GoalView } from '../goals-view.js';

export interface ListGoalsInput {
  userId: string;
  status?: GoalStatus;
  isPrimary?: boolean;
  syncTelemetry?: boolean;
  /** IANA timezone of the user; decides "today" and the Monday..Sunday week (UTC when missing/invalid). */
  timezone?: string;
}

export class ListGoalsUseCase {
  constructor(
    private readonly goalRepo: IGoalRepository,
    private readonly telemetryPort?: IGoalsTelemetryPort,
    private readonly clock: Clock = systemClock,
  ) {}

  async execute(input: ListGoalsInput): Promise<GoalView[]> {
    const goals = await this.goalRepo.listByUser(input.userId, {
      status: input.status,
      isPrimary: input.isPrimary,
    });

    const timeZone = resolveTimeZone(input.timezone);
    const todayStr = todayInTimeZone(this.clock, timeZone);
    const sync = input.syncTelemetry !== false && Boolean(this.telemetryPort);

    const views: GoalView[] = [];

    for (const goal of goals) {
      if (sync && goal.status === 'active' && this.telemetryPort) {
        await this.syncGoalTelemetry(goal, todayStr, timeZone);
      }

      let history: number[] = [];
      let hitDays: number | undefined;

      if (goal.cadence === 'daily' && this.telemetryPort) {
        if (goal.type === 'water') {
          history = await this.telemetryPort.getRecentDailyWaterLiters(input.userId, 7, todayStr);
        } else if (goal.type === 'protein') {
          history = await this.telemetryPort.getRecentDailyProteinGrams(input.userId, 7, todayStr);
        }
        if (history.length > 0) {
          hitDays = history.filter((val) => val >= goal.targetValue).length;
        }
      }

      if (history.length === 0) {
        history = await this.goalRepo.getRecentValues(goal.id, input.userId, 10);
      }

      if (history.length === 0) {
        history = goal.cadence === 'once' ? [goal.startValue, goal.currentValue] : [goal.currentValue];
      }

      views.push(toGoalView(goal, { history, hitDays, timeZone, today: todayStr }));
    }

    return views;
  }

  private async syncGoalTelemetry(goal: Goal, todayStr: string, timeZone: string): Promise<void> {
    if (!this.telemetryPort) return;

    let updatedValue: number | null = null;

    if (goal.type === 'weightLoss' || goal.type === 'maintain' || goal.type === 'muscleGain') {
      const weight = await this.telemetryPort.getLatestWeight(goal.userId);
      if (weight !== null && weight > 0 && weight !== goal.currentValue) {
        updatedValue = weight;
      }
    } else if (goal.type === 'water') {
      const waterLiters = await this.telemetryPort.getDailyWaterIntakeLiters(goal.userId, todayStr);
      if (waterLiters !== goal.currentValue) {
        updatedValue = waterLiters;
      }
    } else if (goal.type === 'protein') {
      const nutrition = await this.telemetryPort.getDailyNutrition(goal.userId, todayStr);
      if (nutrition.proteinG !== goal.currentValue) {
        updatedValue = nutrition.proteinG;
      }
    } else if (goal.type === 'streak') {
      const streak = await this.telemetryPort.getWorkoutStreak(goal.userId, todayStr, timeZone);
      if (streak !== goal.currentValue) {
        updatedValue = streak;
      }
    } else if (goal.type === 'workoutFrequency') {
      // The user's local Monday..Sunday week, expressed as real instants (correct across DST).
      const week = localWeekInstants(todayStr, timeZone);
      const weekEnd = new Date(week.endExclusive.getTime() - 1);

      const count = await this.telemetryPort.getWeeklyWorkoutCount(goal.userId, week.start, weekEnd);
      if (count !== goal.currentValue) {
        updatedValue = count;
      }
    }

    if (updatedValue !== null) {
      // Telemetry sums rows from other tables; never let them push the goal past what it can store.
      goal.updateProgress(clampGoalValue(updatedValue), this.clock());
      await this.goalRepo.save(goal);
    }
  }
}
