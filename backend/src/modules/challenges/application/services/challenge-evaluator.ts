import type { ChallengeMetricType } from '../../domain/challenge.js';
import type { IGamificationTelemetryPort } from '../ports.js';

export interface EvaluateMetricInput {
  userId: string;
  metricType: ChallengeMetricType;
  periodStart: Date;
  periodEnd: Date;
}

export class ChallengeEvaluatorService {
  constructor(private readonly telemetryPort: IGamificationTelemetryPort) {}

  /**
   * Deterministically evaluates genuine user telemetry for a specific metric type
   * within the occurrence period boundaries.
   */
  async evaluateMetric(input: EvaluateMetricInput): Promise<number> {
    const { userId, metricType, periodStart, periodEnd } = input;

    switch (metricType) {
      case 'workout_count':
        return this.telemetryPort.getWorkoutCount(userId, periodStart, periodEnd);

      case 'workout_duration_min':
        return this.telemetryPort.getWorkoutDurationMinutes(userId, periodStart, periodEnd);

      case 'workout_volume_kg':
        return this.telemetryPort.getWorkoutVolumeKg(userId, periodStart, periodEnd);

      case 'habit_completion_count':
        return this.telemetryPort.getHabitCompletionsCount(userId, periodStart, periodEnd);

      case 'habit_streak_days':
        return this.telemetryPort.getMaxHabitStreak(userId);

      case 'water_liters':
        return this.telemetryPort.getWaterLiters(userId, periodStart, periodEnd);

      case 'calorie_compliance_days':
        return this.telemetryPort.getCalorieTargetHitDays(userId, periodStart, periodEnd);

      case 'protein_target_days':
        return this.telemetryPort.getProteinTargetHitDays(userId, periodStart, periodEnd);

      case 'personal_record_count':
        return this.telemetryPort.getPersonalRecordsCount(userId);

      default:
        return 0;
    }
  }
}

