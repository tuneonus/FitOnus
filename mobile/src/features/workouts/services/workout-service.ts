import { workoutApi, type ExerciseListParams } from '../api/workout-api';
import { offlineSyncService } from './offline-sync';
import type {
  Exercise,
  WorkoutTemplate,
  WorkoutDetail,
  SaveWorkoutSessionInput,
  WorkoutSessionResponse,
  PersonalRecordView,
  WorkoutPlanSummaryView,
  WorkoutPlanDetailView,
} from '../types/workout';
import { captureUserSession } from '@/services/user-session';
import { logger } from '@/utils/logger';

export class WorkoutService {
  /**
   * Retrieves system-curated starter templates from backend PostgreSQL.
   */
  static async getTemplates(): Promise<WorkoutTemplate[]> {
    try {
      const res = await workoutApi.getWorkoutPlans({ type: 'templates' });
      return res.plans.map(this.mapPlanSummaryToTemplate);
    } catch (error) {
      logger.error('Failed to load workout templates from backend:', error);
      return [];
    }
  }

  /**
   * Retrieves current member's personal workout routines from backend PostgreSQL.
   */
  static async getMyWorkouts(): Promise<WorkoutTemplate[]> {
    try {
      const res = await workoutApi.getWorkoutPlans({ type: 'mine' });
      return res.plans.map(this.mapPlanSummaryToTemplate);
    } catch (error) {
      logger.error('Failed to load member workouts from backend:', error);
      return [];
    }
  }

  /**
   * Retrieves comprehensive details of a workout plan including exercise configurations.
   */
  static async getWorkoutDetail(id: string): Promise<WorkoutDetail> {
    try {
      const plan = await workoutApi.getWorkoutPlanById(id);
      return this.mapPlanDetailToWorkoutDetail(plan);
    } catch (error) {
      logger.error(`Failed to load workout detail for ${id}:`, error);
      throw error;
    }
  }

  /**
   * Retrieves exercises from global catalog with muscle, category, and equipment filters.
   */
  static async getExercises(params: ExerciseListParams = {}): Promise<Exercise[]> {
    try {
      const res = await workoutApi.getExercises(params);
      return res.exercises;
    } catch (error) {
      logger.error('Failed to load exercises catalog:', error);
      return [];
    }
  }

  /**
   * Retrieves single exercise detail by ID.
   */
  static async getExerciseById(id: string): Promise<Exercise> {
    return await workoutApi.getExerciseById(id);
  }

  /**
   * Atomically saves a completed workout session with offline fallback.
   * If the network is unavailable, enqueues in local storage queue.
   */
  static async saveSession(
    payload: SaveWorkoutSessionInput,
  ): Promise<{ response: WorkoutSessionResponse; isOffline: boolean }> {
    const session = captureUserSession();
    if (!payload.sets.length) throw new Error('Complete at least one set before saving.');
    try {
      // Attempt live atomic submission
      const response = await workoutApi.saveWorkoutSession(payload, payload.clientSessionId);
      session.assertCurrent();
      return { response, isOffline: false };
    } catch (error: any) {
      session.assertCurrent();
      if (
        error?.response?.status &&
        error.response.status < 500 &&
        ![408, 429].includes(error.response.status)
      )
        throw error;
      logger.warn(
        `Direct session submission failed for ${payload.clientSessionId}. Enqueueing offline...`,
        error?.message,
      );

      // Enqueue to persistent offline queue
      await offlineSyncService.enqueueSession(payload);

      // Construct optimistic local response
      const totalVolumeKg = payload.sets.reduce(
        (sum, s) => (s.isWarmup ? sum : sum + s.weightKg * s.reps),
        0,
      );
      const totalReps = payload.sets.reduce((sum, s) => (s.isWarmup ? sum : sum + s.reps), 0);
      const durationMin = Math.max(1, Math.round(payload.durationSeconds / 60));
      const estimatedCaloriesBurned = 0; // Pending the backend calculation.

      const optimisticResponse: WorkoutSessionResponse = {
        id: payload.clientSessionId,
        userId: session.userId!,
        planId: payload.planId ?? null,
        workoutName: payload.workoutName,
        startedAt: payload.startedAt,
        completedAt: payload.completedAt,
        durationSeconds: payload.durationSeconds,
        totalVolumeKg,
        totalSets: payload.sets.length,
        totalReps,
        estimatedCaloriesBurned,
        caloriesSource: 'estimated',
        isCaloriesEstimated: true,
        notes: payload.notes ?? null,
        clientSessionId: payload.clientSessionId,
        sets: payload.sets.map((s, idx) => ({
          id: `local-set-${idx}`,
          exerciseId: s.exerciseId,
          exerciseName: 'Exercise',
          setNumber: s.setNumber,
          weightKg: s.weightKg,
          reps: s.reps,
          isWarmup: Boolean(s.isWarmup),
          rpe: s.rpe ?? null,
        })),
        personalRecords: [],
        createdAt: new Date().toISOString(),
      };

      return { response: optimisticResponse, isOffline: true };
    }
  }

  /**
   * Retrieves verified personal record milestones.
   */
  static async getPersonalRecords(exerciseId?: string): Promise<PersonalRecordView[]> {
    try {
      return await workoutApi.getPersonalRecords(exerciseId);
    } catch (error) {
      logger.error('Failed to load personal records:', error);
      return [];
    }
  }

  // --- Internal Mappers ---

  private static mapPlanSummaryToTemplate(plan: WorkoutPlanSummaryView): WorkoutTemplate {
    return {
      id: plan.id,
      name: plan.name,
      description: plan.description || 'System workout routine',
      estimatedDuration: plan.estimatedDurationMinutes ?? 45,
      difficulty: plan.difficulty
        ? plan.difficulty.charAt(0).toUpperCase() + plan.difficulty.slice(1)
        : 'Intermediate',
      tags: plan.tags || [],
      exercisesCount: plan.exerciseCount ?? 0,
      isAiGenerated: plan.tags?.includes('ai-generated') ?? false,
    };
  }

  private static mapPlanDetailToWorkoutDetail(plan: WorkoutPlanDetailView): WorkoutDetail {
    return {
      id: plan.id,
      name: plan.name,
      description: plan.description || 'System workout routine',
      estimatedDuration: plan.estimatedDurationMinutes ?? 45,
      difficulty: plan.difficulty
        ? plan.difficulty.charAt(0).toUpperCase() + plan.difficulty.slice(1)
        : 'Intermediate',
      tags: plan.tags || [],
      exercisesCount: plan.exerciseCount ?? plan.exercises?.length ?? 0,
      exercises: (plan.exercises || []).map((we) => ({
        id: we.id,
        exerciseId: we.exerciseId,
        targetSets: we.targetSets,
        targetReps: we.targetReps,
        restSeconds: we.restSeconds ?? 60,
        exercise: {
          id: we.exerciseId,
          name: we.exerciseName,
          primaryMuscles: [we.primaryMuscle],
          equipment: we.equipment
            ? we.equipment.charAt(0).toUpperCase() + we.equipment.slice(1)
            : 'Barbell',
          difficulty: plan.difficulty,
        },
      })),
    };
  }
}
