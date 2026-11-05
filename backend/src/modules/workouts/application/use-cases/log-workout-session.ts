import crypto from 'node:crypto';
import type { CalorieSource } from '../../domain/workout-session.js';
import {
  calculateEstimatedCalories,
  calculateTotalVolumeKg,
  WorkoutSession,
  WorkoutSessionSet,
} from '../../domain/workout-session.js';
import { evaluateSetPRs, PersonalRecord, type ExistingBestRecords } from '../../domain/personal-record.js';
import type { IExerciseRepository, IPersonalRecordRepository, IWorkoutSessionRepository } from '../ports.js';
import { toWorkoutSessionView, type WorkoutSessionView } from '../workout-view.js';

export interface LogWorkoutSessionSetInput {
  exerciseId: string;
  setNumber: number;
  weightKg?: number;
  reps?: number;
  durationSeconds?: number;
  isWarmup?: boolean;
  isDropset?: boolean;
  isFailure?: boolean;
  rpe?: number;
  notes?: string;
}

export interface LogWorkoutSessionInput {
  userId: string;
  workoutId?: string;
  workoutName: string;
  startedAt: Date;
  completedAt: Date;
  durationSeconds: number;
  difficultyRating?: number;
  notes?: string;
  caloriesBurned?: number;
  caloriesSource?: CalorieSource;
  userWeightKg?: number;
  sets: LogWorkoutSessionSetInput[];
}

export class LogWorkoutSessionUseCase {
  constructor(
    private readonly sessionRepo: IWorkoutSessionRepository,
    private readonly prRepo: IPersonalRecordRepository,
    private readonly exerciseRepo: IExerciseRepository,
  ) {}

  async execute(input: LogWorkoutSessionInput): Promise<WorkoutSessionView> {
    const sessionId = crypto.randomUUID();
    const now = new Date();

    // 1. Calculate total volume
    const setsData = input.sets.map((s) => ({
      weightKg: s.weightKg ?? 0,
      reps: s.reps ?? 0,
      isWarmup: s.isWarmup ?? false,
    }));
    const totalVolumeKg = calculateTotalVolumeKg(setsData);
    const totalSets = input.sets.filter((s) => !(s.isWarmup ?? false)).length;
    const totalReps = input.sets
      .filter((s) => !(s.isWarmup ?? false))
      .reduce((sum, s) => sum + (s.reps ?? 0), 0);

    // 2. Calorie computation & source tagging
    let caloriesBurned = input.caloriesBurned;
    let caloriesSource: CalorieSource = input.caloriesSource ?? 'estimated';

    if (caloriesBurned === undefined || caloriesBurned === null) {
      const minutes = Math.round(input.durationSeconds / 60);
      caloriesBurned = calculateEstimatedCalories(minutes, input.userWeightKg);
      caloriesSource = 'estimated';
    }

    // 3. PR detection across exercises
    // Group sets by exerciseId
    const setsByExercise = new Map<string, LogWorkoutSessionSetInput[]>();
    for (const set of input.sets) {
      const list = setsByExercise.get(set.exerciseId) ?? [];
      list.push(set);
      setsByExercise.set(set.exerciseId, list);
    }

    const newMilestonePRs: PersonalRecord[] = [];
    const prFlagsBySetIndex = new Set<number>();

    for (const [exerciseId, sets] of setsByExercise.entries()) {
      const existingBests = await this.prRepo.findCurrentBestsForExercise(input.userId, exerciseId);
      const bestMap: ExistingBestRecords = {
        maxWeightKg: 0,
        maxRepsAtWeight: new Map<number, number>(),
        maxVolumeKg: 0,
        maxEstimated1RM: 0,
      };

      for (const pr of existingBests) {
        if (pr.recordType === 'max_weight' && pr.weightKg > bestMap.maxWeightKg) {
          bestMap.maxWeightKg = pr.weightKg;
        } else if (pr.recordType === 'max_reps') {
          const prev = bestMap.maxRepsAtWeight.get(pr.weightKg) ?? 0;
          if (pr.reps > prev) bestMap.maxRepsAtWeight.set(pr.weightKg, pr.reps);
        } else if (pr.recordType === 'max_volume' && pr.volumeKg > bestMap.maxVolumeKg) {
          bestMap.maxVolumeKg = pr.volumeKg;
        } else if (pr.recordType === 'estimated_1rm' && pr.estimated1rmKg > bestMap.maxEstimated1RM) {
          bestMap.maxEstimated1RM = pr.estimated1rmKg;
        }
      }

      // Check exercise name
      const exObj = await this.exerciseRepo.findById(exerciseId);
      const exName = exObj?.name ?? 'Exercise';

      for (let i = 0; i < sets.length; i++) {
        const set = sets[i]!;
        const detected = evaluateSetPRs(
          {
            exerciseId,
            weightKg: set.weightKg ?? 0,
            reps: set.reps ?? 0,
            isWarmup: set.isWarmup ?? false,
          },
          bestMap,
        );

        if (detected.length > 0) {
          // Find original global index in input.sets
          const originalIdx = input.sets.indexOf(set);
          if (originalIdx >= 0) prFlagsBySetIndex.add(originalIdx);

          for (const d of detected) {
            newMilestonePRs.push(
              new PersonalRecord({
                id: crypto.randomUUID(),
                userId: input.userId,
                exerciseId: d.exerciseId,
                exerciseName: exName,
                recordType: d.recordType,
                weightKg: d.weightKg,
                reps: d.reps,
                volumeKg: d.volumeKg,
                estimated1rmKg: d.estimated1rmKg,
                sessionId,
                achievedAt: input.completedAt,
                createdAt: now,
              }),
            );
          }
        }
      }
    }

    // 4. Construct Session Sets
    const domainSets = input.sets.map((s, idx) => {
      return new WorkoutSessionSet({
        id: crypto.randomUUID(),
        sessionId,
        exerciseId: s.exerciseId,
        setNumber: s.setNumber,
        weightKg: s.weightKg ?? 0,
        reps: s.reps ?? 0,
        durationSeconds: s.durationSeconds ?? null,
        isWarmup: s.isWarmup ?? false,
        isDropset: s.isDropset ?? false,
        isFailure: s.isFailure ?? false,
        isPr: prFlagsBySetIndex.has(idx),
        rpe: s.rpe ?? null,
        notes: s.notes ?? null,
        createdAt: now,
      });
    });

    // 5. Construct Session
    const session = new WorkoutSession({
      id: sessionId,
      userId: input.userId,
      workoutId: input.workoutId ?? null,
      workoutName: input.workoutName,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      durationSeconds: input.durationSeconds,
      totalVolumeKg,
      totalSets,
      totalReps,
      caloriesBurned,
      caloriesSource,
      difficultyRating: input.difficultyRating ?? null,
      notes: input.notes ?? null,
      isCompleted: true,
      sets: domainSets,
      createdAt: now,
      updatedAt: now,
    });

    // 6. Atomically persist session + sets
    const saved = await this.sessionRepo.saveCompletedSession(session);

    // 7. Persist any newly broken PR milestones
    if (newMilestonePRs.length > 0) {
      await this.prRepo.insertMilestones(newMilestonePRs);
    }

    return toWorkoutSessionView(saved, newMilestonePRs);
  }
}
