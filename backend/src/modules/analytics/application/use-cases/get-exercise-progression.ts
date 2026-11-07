/**
 * GetExerciseProgression Application Use Case
 *
 * Retrieves exercise-specific top weight, e1RM, volume trends and current PR.
 */

import { AppError } from '../../../../shared/errors/app-error.js';
import { createCalendarBuckets, validateTimezone } from '../../domain/analytics-period.js';
import { buildExerciseProgression } from '../../domain/workout-metrics.js';
import type { IAnalyticsWorkoutRepository } from '../ports.js';
import type { ExerciseProgressionView } from '../dtos.js';
import { normalizeAnalyticsRange, parseReferenceDate } from '../period-helper.js';

export interface GetExerciseProgressionInput {
  userId: string;
  exerciseId: string;
  range?: string | null;
  timezone?: string | null;
  refDate?: string | null;
}

export class GetExerciseProgressionUseCase {
  constructor(private readonly workoutRepo: IAnalyticsWorkoutRepository) {}

  async execute(input: GetExerciseProgressionInput): Promise<ExerciseProgressionView> {
    if (!input.userId || !input.userId.trim()) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'User ID is required');
    }

    if (!input.exerciseId || !input.exerciseId.trim()) {
      throw new AppError('validation', 'VALIDATION_FAILED', 'Exercise ID is required');
    }

    const range = normalizeAnalyticsRange(input.range, 'all');
    const timezone = validateTimezone(input.timezone ?? undefined);
    const now = parseReferenceDate(input.refDate);

    let startUtc: Date;
    let endUtc: Date = now;

    if (range === 'all') {
      // Default historical horizon of 1 year for bounded database scan
      startUtc = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    } else {
      const buckets = createCalendarBuckets(range, now, timezone);
      startUtc = buckets[0]?.startDate ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      endUtc = buckets[buckets.length - 1]?.endDate ?? now;
    }

    const [currentPr, sets] = await Promise.all([
      this.workoutRepo.getExerciseCurrentPr(input.userId, input.exerciseId),
      this.workoutRepo.getExerciseSetsHistory(input.userId, input.exerciseId, startUtc, endUtc),
    ]);

    const progression = buildExerciseProgression(sets);
    const exerciseName = sets.length > 0 && sets[0]?.exerciseName ? sets[0].exerciseName : 'Exercise';

    return {
      exerciseId: input.exerciseId,
      exerciseName,
      currentPr: currentPr
        ? {
            weightKg: currentPr.weightKg,
            reps: currentPr.reps,
            volumeKg: currentPr.volumeKg,
            estimated1rmKg: currentPr.estimated1rmKg,
            achievedAt: currentPr.achievedAt.toISOString(),
          }
        : null,
      progression,
    };
  }
}
