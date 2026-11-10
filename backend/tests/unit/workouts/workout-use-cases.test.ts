import crypto from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  ExerciseFilter,
  IExerciseRepository,
  IPersonalRecordRepository,
  IWorkoutAuditLogger,
  IWorkoutPlanRepository,
  IWorkoutSessionRepository,
  SessionFilter,
  WorkoutPlanFilter,
} from '../../../src/modules/workouts/application/ports.js';
import { AdminManageExerciseUseCase } from '../../../src/modules/workouts/application/use-cases/admin-manage-exercise.js';
import { AdminManageTemplateUseCase } from '../../../src/modules/workouts/application/use-cases/admin-manage-template.js';
import { CreateWorkoutPlanUseCase } from '../../../src/modules/workouts/application/use-cases/create-workout-plan.js';
import { DeleteWorkoutPlanUseCase } from '../../../src/modules/workouts/application/use-cases/delete-workout-plan.js';
import { GetExerciseUseCase } from '../../../src/modules/workouts/application/use-cases/get-exercise.js';
import { GetWorkoutPlanUseCase } from '../../../src/modules/workouts/application/use-cases/get-workout-plan.js';
import { GetWorkoutSessionUseCase } from '../../../src/modules/workouts/application/use-cases/get-workout-session.js';
import { GetWorkoutStatsUseCase } from '../../../src/modules/workouts/application/use-cases/get-workout-stats.js';
import { ListExercisesUseCase } from '../../../src/modules/workouts/application/use-cases/list-exercises.js';
import { ListPersonalRecordsUseCase } from '../../../src/modules/workouts/application/use-cases/list-personal-records.js';
import { ListWorkoutPlansUseCase } from '../../../src/modules/workouts/application/use-cases/list-workout-plans.js';
import { ListWorkoutSessionsUseCase } from '../../../src/modules/workouts/application/use-cases/list-workout-sessions.js';
import { LogWorkoutSessionUseCase } from '../../../src/modules/workouts/application/use-cases/log-workout-session.js';
import { UpdateWorkoutPlanUseCase } from '../../../src/modules/workouts/application/use-cases/update-workout-plan.js';
import { Exercise, type ExerciseProps } from '../../../src/modules/workouts/domain/exercise.js';
import type { PersonalRecord } from '../../../src/modules/workouts/domain/personal-record.js';
import { WorkoutPlan } from '../../../src/modules/workouts/domain/workout-plan.js';
import type { WorkoutSession } from '../../../src/modules/workouts/domain/workout-session.js';

// --- In-Memory Fake Repositories ---

class FakeExerciseRepository implements IExerciseRepository {
  readonly exercises = new Map<string, Exercise>();

  findById(id: string): Promise<Exercise | null> {
    const ex = this.exercises.get(id);
    return Promise.resolve(ex && ex.deletedAt === null ? ex : null);
  }

  list(filter: ExerciseFilter): Promise<{ exercises: Exercise[]; total: number }> {
    let result = Array.from(this.exercises.values()).filter((e) => e.deletedAt === null);

    if (filter.search) {
      const q = filter.search.toLowerCase();
      result = result.filter((e) => e.name.toLowerCase().includes(q));
    }
    if (filter.muscle) {
      result = result.filter(
        (e) => e.primaryMuscles.includes(filter.muscle!) || e.secondaryMuscles.includes(filter.muscle!),
      );
    }
    if (filter.equipment) {
      result = result.filter((e) => e.equipment.toLowerCase() === filter.equipment!.toLowerCase());
    }

    const total = result.length;
    const paginated = result.slice(filter.offset, filter.offset + filter.limit);
    return Promise.resolve({ exercises: paginated, total });
  }

  create(exercise: Exercise): Promise<Exercise> {
    this.exercises.set(exercise.id, exercise);
    return Promise.resolve(exercise);
  }

  update(id: string, patch: Partial<ExerciseProps>): Promise<Exercise | null> {
    const existing = this.exercises.get(id);
    if (!existing || existing.deletedAt !== null) return Promise.resolve(null);
    const updated = new Exercise({
      id: existing.id,
      name: patch.name ?? existing.name,
      description: patch.description !== undefined ? patch.description : existing.description,
      instructions: patch.instructions ?? [...existing.instructions],
      tips: patch.tips ?? [...existing.tips],
      commonMistakes: patch.commonMistakes ?? [...existing.commonMistakes],
      primaryMuscles: patch.primaryMuscles ?? [...existing.primaryMuscles],
      secondaryMuscles: patch.secondaryMuscles ?? [...existing.secondaryMuscles],
      equipment: patch.equipment ?? existing.equipment,
      category: patch.category ?? existing.category,
      difficulty: patch.difficulty ?? existing.difficulty,
      isCompound: patch.isCompound !== undefined ? patch.isCompound : existing.isCompound,
      imageUrl: patch.imageUrl !== undefined ? patch.imageUrl : existing.imageUrl,
      videoUrl: patch.videoUrl !== undefined ? patch.videoUrl : existing.videoUrl,
      createdBy: existing.createdBy,
      isSystem: existing.isSystem,
      createdAt: existing.createdAt,
      updatedAt: patch.updatedAt ?? new Date(),
      deletedAt: patch.deletedAt !== undefined ? patch.deletedAt : existing.deletedAt,
    });
    this.exercises.set(id, updated);
    return Promise.resolve(updated);
  }

  softDelete(id: string): Promise<boolean> {
    const existing = this.exercises.get(id);
    if (!existing || existing.deletedAt !== null) return Promise.resolve(false);
    const updated = new Exercise({
      ...existing,
      instructions: [...existing.instructions],
      tips: [...existing.tips],
      commonMistakes: [...existing.commonMistakes],
      primaryMuscles: [...existing.primaryMuscles],
      secondaryMuscles: [...existing.secondaryMuscles],
      deletedAt: new Date(),
    });
    this.exercises.set(id, updated);
    return Promise.resolve(true);
  }

  countAll(): Promise<number> {
    return Promise.resolve(Array.from(this.exercises.values()).filter((e) => e.deletedAt === null).length);
  }
}

class FakeWorkoutPlanRepository implements IWorkoutPlanRepository {
  readonly plans = new Map<string, WorkoutPlan>();

  findById(id: string): Promise<WorkoutPlan | null> {
    const p = this.plans.get(id);
    return Promise.resolve(p && p.deletedAt === null ? p : null);
  }

  listForUser(userId: string, filter: WorkoutPlanFilter): Promise<{ plans: WorkoutPlan[]; total: number }> {
    let result = Array.from(this.plans.values()).filter((p) => p.deletedAt === null);

    if (filter.type === 'mine') {
      result = result.filter((p) => p.userId === userId);
    } else if (filter.type === 'templates') {
      result = result.filter((p) => p.isTemplate && p.userId === null);
    } else {
      result = result.filter((p) => p.userId === userId || (p.isTemplate && p.userId === null));
    }

    const total = result.length;
    const paginated = result.slice(filter.offset, filter.offset + filter.limit);
    return Promise.resolve({ plans: paginated, total });
  }

  listSystemTemplates(
    offset: number,
    limit: number,
    search?: string,
  ): Promise<{ templates: WorkoutPlan[]; total: number }> {
    let result = Array.from(this.plans.values()).filter(
      (p) => p.isTemplate && p.userId === null && p.deletedAt === null,
    );
    if (search) {
      result = result.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
    }
    const total = result.length;
    const paginated = result.slice(offset, offset + limit);
    return Promise.resolve({ templates: paginated, total });
  }

  create(plan: WorkoutPlan): Promise<WorkoutPlan> {
    this.plans.set(plan.id, plan);
    return Promise.resolve(plan);
  }

  update(id: string, plan: WorkoutPlan): Promise<WorkoutPlan | null> {
    if (!this.plans.has(id)) return Promise.resolve(null);
    this.plans.set(id, plan);
    return Promise.resolve(plan);
  }

  softDelete(id: string): Promise<boolean> {
    const existing = this.plans.get(id);
    if (!existing || existing.deletedAt !== null) return Promise.resolve(false);
    const updated = new WorkoutPlan({
      ...existing,
      tags: [...existing.tags],
      exercises: [...existing.exercises],
      deletedAt: new Date(),
    });
    this.plans.set(id, updated);
    return Promise.resolve(true);
  }

  countSystemTemplates(): Promise<number> {
    return Promise.resolve(
      Array.from(this.plans.values()).filter((p) => p.isTemplate && p.userId === null && p.deletedAt === null)
        .length,
    );
  }
}

class FakeWorkoutSessionRepository implements IWorkoutSessionRepository {
  readonly sessions = new Map<string, WorkoutSession>();

  findById(id: string): Promise<WorkoutSession | null> {
    return Promise.resolve(this.sessions.get(id) ?? null);
  }

  listForUser(userId: string, filter: SessionFilter): Promise<{ sessions: WorkoutSession[]; total: number }> {
    let result = Array.from(this.sessions.values()).filter((s) => s.userId === userId);
    if (filter.workoutId) {
      result = result.filter((s) => s.workoutId === filter.workoutId);
    }
    const total = result.length;
    const paginated = result.slice(filter.offset, filter.offset + filter.limit);
    return Promise.resolve({ sessions: paginated, total });
  }

  saveCompletedSession(session: WorkoutSession): Promise<WorkoutSession> {
    this.sessions.set(session.id, session);
    return Promise.resolve(session);
  }

  countCompletedSessions(): Promise<number> {
    return Promise.resolve(Array.from(this.sessions.values()).filter((s) => s.isCompleted).length);
  }

  getTotalVolumeLifted(): Promise<number> {
    return Promise.resolve(Array.from(this.sessions.values()).reduce((sum, s) => sum + s.totalVolumeKg, 0));
  }

  getDistinctLiftersCount(): Promise<number> {
    const userIds = new Set(Array.from(this.sessions.values()).map((s) => s.userId));
    return Promise.resolve(userIds.size);
  }
}

class FakePersonalRecordRepository implements IPersonalRecordRepository {
  readonly records: PersonalRecord[] = [];

  findCurrentBestsForExercise(userId: string, exerciseId: string): Promise<PersonalRecord[]> {
    const userRecords = this.records.filter((r) => r.userId === userId && r.exerciseId === exerciseId);
    const bestsByType = new Map<string, PersonalRecord>();
    for (const r of userRecords) {
      const existing = bestsByType.get(r.recordType);
      if (!existing) {
        bestsByType.set(r.recordType, r);
      } else if (r.recordType === 'max_weight' && r.weightKg >= existing.weightKg) {
        bestsByType.set(r.recordType, r);
      } else if (r.recordType === 'max_volume' && r.volumeKg >= existing.volumeKg) {
        bestsByType.set(r.recordType, r);
      } else if (r.recordType === 'estimated_1rm' && r.estimated1rmKg >= existing.estimated1rmKg) {
        bestsByType.set(r.recordType, r);
      } else if (r.recordType === 'max_reps' && r.reps >= existing.reps) {
        bestsByType.set(r.recordType, r);
      }
    }
    return Promise.resolve(Array.from(bestsByType.values()));
  }

  listCurrentBests(userId: string, exerciseId?: string): Promise<PersonalRecord[]> {
    let userRecords = this.records.filter((r) => r.userId === userId);
    if (exerciseId) {
      userRecords = userRecords.filter((r) => r.exerciseId === exerciseId);
    }
    const bestsByKey = new Map<string, PersonalRecord>();
    for (const r of userRecords) {
      const key = `${r.exerciseId}:${r.recordType}`;
      const existing = bestsByKey.get(key);
      if (!existing) {
        bestsByKey.set(key, r);
      } else if (r.recordType === 'max_weight' && r.weightKg >= existing.weightKg) {
        bestsByKey.set(key, r);
      } else if (r.recordType === 'max_volume' && r.volumeKg >= existing.volumeKg) {
        bestsByKey.set(key, r);
      } else if (r.recordType === 'estimated_1rm' && r.estimated1rmKg >= existing.estimated1rmKg) {
        bestsByKey.set(key, r);
      } else if (r.recordType === 'max_reps' && r.reps >= existing.reps) {
        bestsByKey.set(key, r);
      }
    }
    return Promise.resolve(Array.from(bestsByKey.values()));
  }

  listProgressionHistory(userId: string, exerciseId: string): Promise<PersonalRecord[]> {
    return Promise.resolve(
      this.records
        .filter((r) => r.userId === userId && r.exerciseId === exerciseId)
        .sort((a, b) => a.achievedAt.getTime() - b.achievedAt.getTime()),
    );
  }

  insertMilestones(records: PersonalRecord[]): Promise<PersonalRecord[]> {
    this.records.push(...records);
    return Promise.resolve(records);
  }
}

class FakeWorkoutAuditLogger implements IWorkoutAuditLogger {
  readonly logs: { adminId: string; action: string; details: Record<string, unknown> }[] = [];

  logAction(adminId: string, action: string, details: Record<string, unknown>): Promise<void> {
    this.logs.push({ adminId, action, details });
    return Promise.resolve();
  }
}

// --- Test Suite ---

describe('Workouts Module — Use Cases', () => {
  let exerciseRepo: FakeExerciseRepository;
  let workoutRepo: FakeWorkoutPlanRepository;
  let sessionRepo: FakeWorkoutSessionRepository;
  let prRepo: FakePersonalRecordRepository;
  let auditLogger: FakeWorkoutAuditLogger;

  const exerciseId1 = crypto.randomUUID();
  const exerciseId2 = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const adminId = crypto.randomUUID();

  beforeEach(async () => {
    exerciseRepo = new FakeExerciseRepository();
    workoutRepo = new FakeWorkoutPlanRepository();
    sessionRepo = new FakeWorkoutSessionRepository();
    prRepo = new FakePersonalRecordRepository();
    auditLogger = new FakeWorkoutAuditLogger();

    // Populate initial 2 exercises
    await exerciseRepo.create(
      new Exercise({
        id: exerciseId1,
        name: 'Barbell Bench Press',
        description: 'Chest press',
        instructions: ['Lie on bench', 'Press bar'],
        tips: ['Plant feet'],
        commonMistakes: ['Bouncing bar'],
        primaryMuscles: ['Chest'],
        secondaryMuscles: ['Triceps'],
        equipment: 'Barbell',
        category: 'strength',
        difficulty: 'intermediate',
        isCompound: true,
        imageUrl: null,
        videoUrl: null,
        createdBy: null,
        isSystem: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }),
    );

    await exerciseRepo.create(
      new Exercise({
        id: exerciseId2,
        name: 'Back Squat',
        description: 'Barbell squat',
        instructions: ['Stand tall', 'Squat deep'],
        tips: ['Knees over toes'],
        commonMistakes: ['Rounding back'],
        primaryMuscles: ['Legs'],
        secondaryMuscles: ['Glutes'],
        equipment: 'Barbell',
        category: 'strength',
        difficulty: 'intermediate',
        isCompound: true,
        imageUrl: null,
        videoUrl: null,
        createdBy: null,
        isSystem: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }),
    );
  });

  describe('Exercises', () => {
    it('lists exercises with search filter', async () => {
      const useCase = new ListExercisesUseCase(exerciseRepo);
      const res = await useCase.execute({ search: 'Bench' });
      expect(res.total).toBe(1);
      expect(res.exercises[0]?.name).toBe('Barbell Bench Press');
    });

    it('filters exercises by muscle group', async () => {
      const useCase = new ListExercisesUseCase(exerciseRepo);
      const res = await useCase.execute({ muscle: 'Legs' });
      expect(res.total).toBe(1);
      expect(res.exercises[0]?.name).toBe('Back Squat');
    });

    it('gets exercise by id', async () => {
      const useCase = new GetExerciseUseCase(exerciseRepo);
      const res = await useCase.execute(exerciseId1);
      expect(res.name).toBe('Barbell Bench Press');
      expect(res.isCompound).toBe(true);
    });

    it('throws not found for unknown exercise id', async () => {
      const useCase = new GetExerciseUseCase(exerciseRepo);
      await expect(useCase.execute(crypto.randomUUID())).rejects.toThrow('Exercise not found.');
    });
  });

  describe('Workout Plans', () => {
    it('creates a custom workout plan for a user', async () => {
      const useCase = new CreateWorkoutPlanUseCase(workoutRepo, exerciseRepo);
      const res = await useCase.execute({
        userId,
        name: 'My Push Day',
        description: 'Heavy chest push',
        exercises: [
          {
            exerciseId: exerciseId1,
            orderIndex: 0,
            targetSets: 3,
            targetReps: '8-10',
            targetWeightKg: 80,
            restSeconds: 90,
          },
        ],
      });

      expect(res.name).toBe('My Push Day');
      expect(res.userId).toBe(userId);
      expect(res.isTemplate).toBe(false);
      expect(res.exercisesCount).toBe(1);
    });

    it('rejects plan creation with non-existent exercise', async () => {
      const useCase = new CreateWorkoutPlanUseCase(workoutRepo, exerciseRepo);
      await expect(
        useCase.execute({
          userId,
          name: 'Invalid Plan',
          exercises: [
            {
              exerciseId: crypto.randomUUID(),
              orderIndex: 0,
              targetSets: 3,
              targetReps: '10',
              restSeconds: 60,
            },
          ],
        }),
      ).rejects.toThrow('does not exist');
    });

    it('lists both personal plans and system templates for a member', async () => {
      // Create 1 personal plan
      const createPlan = new CreateWorkoutPlanUseCase(workoutRepo, exerciseRepo);
      await createPlan.execute({
        userId,
        name: 'Personal Routine',
        exercises: [
          { exerciseId: exerciseId1, orderIndex: 0, targetSets: 3, targetReps: '10', restSeconds: 60 },
        ],
      });

      // Create 1 system template (userId = null)
      const createTemplate = new AdminManageTemplateUseCase(workoutRepo, exerciseRepo, auditLogger);
      await createTemplate.create({
        adminId,
        name: 'Curated Starter Routine',
        exercises: [
          { exerciseId: exerciseId2, orderIndex: 0, targetSets: 4, targetReps: '8', restSeconds: 90 },
        ],
      });

      const listPlans = new ListWorkoutPlansUseCase(workoutRepo);
      const all = await listPlans.execute({ userId, type: 'all' });
      expect(all.total).toBe(2);

      const templatesOnly = await listPlans.execute({ userId, type: 'templates' });
      expect(templatesOnly.total).toBe(1);
      expect(templatesOnly.plans[0]?.name).toBe('Curated Starter Routine');
      expect(templatesOnly.plans[0]?.userId).toBeNull();

      const mineOnly = await listPlans.execute({ userId, type: 'mine' });
      expect(mineOnly.total).toBe(1);
      expect(mineOnly.plans[0]?.name).toBe('Personal Routine');
    });

    it('retrieves workout plan by id and deletes plan', async () => {
      const createPlan = new CreateWorkoutPlanUseCase(workoutRepo, exerciseRepo);
      const plan = await createPlan.execute({
        userId,
        name: 'Plan To Delete',
        exercises: [
          { exerciseId: exerciseId1, orderIndex: 0, targetSets: 3, targetReps: '10', restSeconds: 60 },
        ],
      });

      const getPlan = new GetWorkoutPlanUseCase(workoutRepo);
      const fetched = await getPlan.execute(userId, plan.id);
      expect(fetched.name).toBe('Plan To Delete');

      const updatePlan = new UpdateWorkoutPlanUseCase(workoutRepo, exerciseRepo);
      const updated = await updatePlan.execute({
        userId,
        planId: plan.id,
        name: 'Plan To Delete Renamed',
      });
      expect(updated.name).toBe('Plan To Delete Renamed');

      const deletePlan = new DeleteWorkoutPlanUseCase(workoutRepo);
      await deletePlan.execute(userId, plan.id);

      await expect(getPlan.execute(userId, plan.id)).rejects.toThrow('Workout plan not found.');
    });
  });

  describe('Workout Sessions & Personal Records', () => {
    it('atomically saves a completed workout session, calculates volume & MET calories, and records PRs', async () => {
      const logSession = new LogWorkoutSessionUseCase(sessionRepo, prRepo, exerciseRepo);
      const startedAt = new Date('2026-11-05T06:00:00Z');
      const completedAt = new Date('2026-11-05T06:45:00Z');

      const { value: session } = await logSession.execute({
        userId,
        workoutName: 'Chest Strength Day',
        startedAt,
        completedAt,
        durationSeconds: 2700, // 45 minutes
        userWeightKg: 80,
        sets: [
          {
            exerciseId: exerciseId1,
            setNumber: 1,
            weightKg: 80,
            reps: 10,
            isWarmup: false,
          },
          {
            exerciseId: exerciseId1,
            setNumber: 2,
            weightKg: 85,
            reps: 8,
            isWarmup: false,
          },
        ],
      });

      expect(session.isCompleted).toBe(true);
      expect(session.totalVolumeKg).toBe(80 * 10 + 85 * 8); // 800 + 680 = 1480
      expect(session.totalSets).toBe(2);
      expect(session.totalReps).toBe(18);
      expect(session.isCaloriesEstimated).toBe(true);
      expect(session.caloriesBurned).toBeGreaterThan(0);
      expect(session.newPersonalRecords?.length).toBeGreaterThan(0);

      // Verify PR milestones were recorded in PR repository
      const prs = await prRepo.findCurrentBestsForExercise(userId, exerciseId1);
      expect(prs.some((p) => p.recordType === 'max_weight' && p.weightKg === 85)).toBe(true);
    });

    it('detects progressive overload PR milestones across multiple sessions', async () => {
      const logSession = new LogWorkoutSessionUseCase(sessionRepo, prRepo, exerciseRepo);

      // Session 1: Bench 80kg x 8
      await logSession.execute({
        userId,
        workoutName: 'Week 1 Push',
        startedAt: new Date('2026-11-01T06:00:00Z'),
        completedAt: new Date('2026-11-01T06:40:00Z'),
        durationSeconds: 2400,
        sets: [{ exerciseId: exerciseId1, setNumber: 1, weightKg: 80, reps: 8, isWarmup: false }],
      });

      // Session 2: Bench 85kg x 8 (New max_weight PR!)
      const { value: session2 } = await logSession.execute({
        userId,
        workoutName: 'Week 2 Push',
        startedAt: new Date('2026-11-05T06:00:00Z'),
        completedAt: new Date('2026-11-05T06:40:00Z'),
        durationSeconds: 2400,
        sets: [{ exerciseId: exerciseId1, setNumber: 1, weightKg: 85, reps: 8, isWarmup: false }],
      });

      expect(session2.newPersonalRecords?.some((p) => p.recordType === 'max_weight')).toBe(true);

      // Verify history stores both milestones for strength progression curve
      const listPrs = new ListPersonalRecordsUseCase(prRepo);
      const history = await listPrs.execute({ userId, exerciseId: exerciseId1, type: 'history' });
      expect(history.records.length).toBeGreaterThanOrEqual(2);

      // Verify list sessions and get session by id
      const listSessions = new ListWorkoutSessionsUseCase(sessionRepo);
      const userSessions = await listSessions.execute({ userId });
      expect(userSessions.total).toBe(2);

      const getSession = new GetWorkoutSessionUseCase(sessionRepo);
      const sessionDetail = await getSession.execute(userId, session2.id);
      expect(sessionDetail.workoutName).toBe('Week 2 Push');
    });
  });

  describe('Admin Workout Governance', () => {
    it('creates, updates, and soft-deletes a global exercise with audit logging', async () => {
      const manageExercise = new AdminManageExerciseUseCase(exerciseRepo, auditLogger);

      const created = await manageExercise.create({
        adminId,
        name: 'Incline Cable Fly',
        description: 'Upper chest isolation',
        instructions: ['Set pulleys low', 'Fly upward'],
        primaryMuscles: ['Chest'],
        secondaryMuscles: ['Shoulders'],
        equipment: 'Cable',
        category: 'strength',
        difficulty: 'intermediate',
      });

      expect(created.name).toBe('Incline Cable Fly');
      expect(created.isSystem).toBe(true);
      expect(auditLogger.logs.some((l) => l.action === 'workout.exercise.create')).toBe(true);

      const updated = await manageExercise.update({
        adminId,
        exerciseId: created.id,
        difficulty: 'advanced',
      });
      expect(updated.difficulty).toBe('advanced');
      expect(auditLogger.logs.some((l) => l.action === 'workout.exercise.update')).toBe(true);

      await manageExercise.delete(adminId, created.id);
      expect(auditLogger.logs.some((l) => l.action === 'workout.exercise.delete')).toBe(true);

      const getExercise = new GetExerciseUseCase(exerciseRepo);
      await expect(getExercise.execute(created.id)).rejects.toThrow('Exercise not found.');
    });

    it('blocks deletion of foundational system exercises', async () => {
      const manageExercise = new AdminManageExerciseUseCase(exerciseRepo, auditLogger);
      const protectedId = 'e0000000-0000-4000-8000-000000000001';

      await expect(manageExercise.delete(adminId, protectedId)).rejects.toThrow(
        'The 14 foundational system exercises are protected and cannot be deleted.',
      );
    });

    it('aggregates platform workout stats', async () => {
      const logSession = new LogWorkoutSessionUseCase(sessionRepo, prRepo, exerciseRepo);
      await logSession.execute({
        userId,
        workoutName: 'Session 1',
        startedAt: new Date(),
        completedAt: new Date(),
        durationSeconds: 1800,
        sets: [{ exerciseId: exerciseId1, setNumber: 1, weightKg: 100, reps: 10, isWarmup: false }],
      });

      const getStats = new GetWorkoutStatsUseCase(exerciseRepo, workoutRepo, sessionRepo);
      const stats = await getStats.execute();

      expect(stats.totalExercises).toBe(2);
      expect(stats.totalCompletedSessions).toBe(1);
      expect(stats.totalVolumeLiftedKg).toBe(1000);
      expect(stats.activeLiftersCount).toBe(1);
    });
  });
});
