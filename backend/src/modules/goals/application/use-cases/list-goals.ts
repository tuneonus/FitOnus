import type { GoalStatus } from '../../domain/goal.js';
import type { IGoalRepository, IGoalsTelemetryPort } from '../ports.js';
import { toGoalView, type GoalView } from '../goals-view.js';

export interface ListGoalsInput {
  userId: string;
  status?: GoalStatus;
  isPrimary?: boolean;
  syncTelemetry?: boolean;
}

export class ListGoalsUseCase {
  constructor(
    private readonly goalRepo: IGoalRepository,
    private readonly telemetryPort?: IGoalsTelemetryPort,
  ) {}

  async execute(input: ListGoalsInput): Promise<GoalView[]> {
    const goals = await this.goalRepo.listByUser(input.userId, {
      status: input.status,
      isPrimary: input.isPrimary,
    });

    const todayStr = new Date().toISOString().slice(0, 10);
    const sync = input.syncTelemetry !== false && Boolean(this.telemetryPort);

    const views: GoalView[] = [];

    for (const goal of goals) {
      if (sync && goal.status === 'active' && this.telemetryPort) {
        await this.syncGoalTelemetry(goal, todayStr);
      }

      let history: number[] = [];
      let hitDays: number | undefined;

      if (goal.cadence === 'daily' && this.telemetryPort) {
        if (goal.type === 'water') {
          history = await this.telemetryPort.getRecentDailyWaterLiters(input.userId, 7);
        } else if (goal.type === 'protein') {
          history = await this.telemetryPort.getRecentDailyProteinGrams(input.userId, 7);
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

      views.push(toGoalView(goal, { history, hitDays }));
    }

    return views;
  }

  private async syncGoalTelemetry(goal: import('../../domain/goal.js').Goal, todayStr: string): Promise<void> {
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
      const streak = await this.telemetryPort.getWorkoutStreak(goal.userId, todayStr);
      if (streak !== goal.currentValue) {
        updatedValue = streak;
      }
    } else if (goal.type === 'workoutFrequency') {
      const now = new Date();
      // Start of current week (Monday)
      const day = now.getUTCDay() || 7;
      const startOfWeek = new Date(now);
      startOfWeek.setUTCDate(now.getUTCDate() - day + 1);
      startOfWeek.setUTCHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);
      endOfWeek.setUTCHours(23, 59, 59, 999);

      const count = await this.telemetryPort.getWeeklyWorkoutCount(goal.userId, startOfWeek, endOfWeek);
      if (count !== goal.currentValue) {
        updatedValue = count;
      }
    }

    if (updatedValue !== null) {
      goal.updateProgress(updatedValue);
      await this.goalRepo.save(goal);
    }
  }
}
