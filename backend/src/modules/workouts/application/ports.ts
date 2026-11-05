import type { Exercise, ExerciseProps } from '../domain/exercise.js';
import type { PersonalRecord } from '../domain/personal-record.js';
import type { WorkoutPlan } from '../domain/workout-plan.js';
import type { WorkoutSession } from '../domain/workout-session.js';

export interface ExerciseFilter {
  search?: string;
  muscle?: string;
  category?: string;
  equipment?: string;
  difficulty?: string;
  offset: number;
  limit: number;
}

export interface IExerciseRepository {
  findById(id: string): Promise<Exercise | null>;
  list(filter: ExerciseFilter): Promise<{ exercises: Exercise[]; total: number }>;
  create(exercise: Exercise): Promise<Exercise>;
  update(id: string, patch: Partial<ExerciseProps>): Promise<Exercise | null>;
  softDelete(id: string): Promise<boolean>;
  countAll(): Promise<number>;
}

export interface WorkoutPlanFilter {
  type?: 'all' | 'mine' | 'templates';
  offset: number;
  limit: number;
}

export interface IWorkoutPlanRepository {
  findById(id: string): Promise<WorkoutPlan | null>;
  listForUser(userId: string, filter: WorkoutPlanFilter): Promise<{ plans: WorkoutPlan[]; total: number }>;
  listSystemTemplates(
    offset: number,
    limit: number,
    search?: string,
  ): Promise<{ templates: WorkoutPlan[]; total: number }>;
  create(plan: WorkoutPlan): Promise<WorkoutPlan>;
  update(id: string, plan: WorkoutPlan): Promise<WorkoutPlan | null>;
  softDelete(id: string): Promise<boolean>;
  countSystemTemplates(): Promise<number>;
}

export interface SessionFilter {
  workoutId?: string;
  startDate?: Date;
  endDate?: Date;
  offset: number;
  limit: number;
}

export interface IWorkoutSessionRepository {
  findById(id: string): Promise<WorkoutSession | null>;
  listForUser(userId: string, filter: SessionFilter): Promise<{ sessions: WorkoutSession[]; total: number }>;
  saveCompletedSession(session: WorkoutSession): Promise<WorkoutSession>;
  countCompletedSessions(): Promise<number>;
  getTotalVolumeLifted(): Promise<number>;
  getDistinctLiftersCount(): Promise<number>;
}

export interface IPersonalRecordRepository {
  findCurrentBestsForExercise(userId: string, exerciseId: string): Promise<PersonalRecord[]>;
  listCurrentBests(userId: string, exerciseId?: string): Promise<PersonalRecord[]>;
  listProgressionHistory(userId: string, exerciseId: string): Promise<PersonalRecord[]>;
  insertMilestones(records: PersonalRecord[]): Promise<PersonalRecord[]>;
}

export interface IWorkoutAuditLogger {
  logAction(
    adminId: string,
    action: string,
    details: Record<string, unknown>,
    targetUserId?: string | null,
    ipAddress?: string | null,
    userAgent?: string | null,
  ): Promise<void>;
}
