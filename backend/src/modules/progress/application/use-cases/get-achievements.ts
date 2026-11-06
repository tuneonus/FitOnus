import { AppError } from '../../../../shared/errors/app-error.js';
import type { IProgressTelemetryPort, IWeightRepository } from '../ports.js';

export interface AchievementItem {
  title: string;
  detail: string;
  earned: boolean;
}

export class GetAchievementsUseCase {
  constructor(
    private readonly weightRepo: IWeightRepository,
    private readonly telemetryPort: IProgressTelemetryPort,
  ) {}

  async execute(input: { userId: string }): Promise<{ achievements: AchievementItem[] }> {
    if (!input.userId) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'User ID is required');
    }

    const achievements: AchievementItem[] = [];

    // 1. Personal Records (Strength PRs from personal_records table)
    const prs = await this.telemetryPort.getPersonalRecords(input.userId);
    const topPr = prs[0];
    if (topPr) {
      achievements.push({
        title: `${topPr.exerciseName} PR`,
        detail: `${topPr.weightKg} kg × ${topPr.reps} · ${formatDateShort(topPr.achievedAt)}`,
        earned: true,
      });
    }

    // 2. Workout Consistency Milestone (from workout_sessions in last 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sessions = await this.telemetryPort.getWorkoutSessions(input.userId, thirtyDaysAgo, now);
    const completedCount = sessions.length;

    const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(now);
    const targetMonthlySessions = 16;
    if (completedCount >= targetMonthlySessions) {
      achievements.push({
        title: `${completedCount}-workout month`,
        detail: monthName,
        earned: true,
      });
    } else {
      achievements.push({
        title: `${targetMonthlySessions}-workout month`,
        detail: `${completedCount} of ${targetMonthlySessions} sessions`,
        earned: false,
      });
    }

    // 3. Weight Loss / Goal Milestone (from starting vs current weight)
    const weightSummary = await this.weightRepo.getUserWeightSummary(input.userId);
    if (
      weightSummary.currentWeightKg !== null &&
      weightSummary.startingWeightKg !== null &&
      weightSummary.startingWeightKg > weightSummary.currentWeightKg
    ) {
      const lost = Math.round((weightSummary.startingWeightKg - weightSummary.currentWeightKg) * 10) / 10;
      const targetLoss = 10; // Standard 10kg milestone
      if (lost >= targetLoss) {
        achievements.push({
          title: '10 kg down',
          detail: `Goal milestone reached (${lost} kg lost)`,
          earned: true,
        });
      } else if (lost > 0) {
        achievements.push({
          title: '10 kg down',
          detail: `${lost.toFixed(1)} of ${targetLoss} kg`,
          earned: false,
        });
      }
    }

    return { achievements };
  }
}

function formatDateShort(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}`;
}
