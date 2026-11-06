import type { WeightLog } from '../domain/weight-log.js';
import type { BodyMeasurement } from '../domain/body-measurement.js';

export interface WeightFilter {
  startDate?: Date;
  endDate?: Date;
  offset?: number;
  limit?: number;
  includeDeleted?: boolean;
}

export interface UserWeightSummary {
  currentWeightKg: number | null;
  startingWeightKg: number | null;
  targetWeightKg: number | null;
  latestLoggedAt: Date | null;
  totalLogsCount: number;
}

export interface IWeightRepository {
  save(log: WeightLog): Promise<{ log: WeightLog; isNew: boolean }>;
  update(
    id: string,
    userId: string,
    patch: { weightKg?: number; loggedAt?: Date; notes?: string | null; source?: import('../domain/weight-log.js').WeightSource },
  ): Promise<WeightLog | null>;
  findById(id: string, userId: string): Promise<WeightLog | null>;
  findByClientId(clientId: string, userId: string): Promise<WeightLog | null>;
  listForUser(userId: string, filter?: WeightFilter): Promise<{ logs: WeightLog[]; total: number }>;
  getLatestForUser(userId: string): Promise<WeightLog | null>;
  getEarliestForUser(userId: string): Promise<WeightLog | null>;
  getUserWeightSummary(userId: string): Promise<UserWeightSummary>;
  softDelete(id: string, userId: string): Promise<boolean>;
  hardDelete(id: string, userId: string): Promise<boolean>;
}

export interface MeasurementFilter {
  startDate?: Date;
  endDate?: Date;
  offset?: number;
  limit?: number;
  includeDeleted?: boolean;
}

export interface IBodyMeasurementRepository {
  save(measurement: BodyMeasurement): Promise<{ measurement: BodyMeasurement; isNew: boolean }>;
  update(
    id: string,
    userId: string,
    patch: Partial<import('../domain/body-measurement.js').BodyMeasurementProps>,
  ): Promise<BodyMeasurement | null>;
  findById(id: string, userId: string): Promise<BodyMeasurement | null>;
  findByClientId(clientId: string, userId: string): Promise<BodyMeasurement | null>;
  listForUser(userId: string, filter?: MeasurementFilter): Promise<{ measurements: BodyMeasurement[]; total: number }>;
  getLatestForUser(userId: string): Promise<BodyMeasurement | null>;
  softDelete(id: string, userId: string): Promise<boolean>;
}

export interface UserProfileProgressGoals {
  primaryGoal: string | null;
  targetWeightKg: number | null;
  startingWeightKg: number | null;
  currentWeightKg: number | null;
  dailyCalorieTarget: number | null;
  dailyProteinGrams: number | null;
  workoutDaysPerWeek: number | null;
}

export interface WorkoutSessionSummary {
  id: string;
  name: string;
  startedAt: Date;
  completedAt: Date;
  durationSeconds: number;
  totalVolumeKg: number;
  isCompleted: boolean;
}

export interface DailyNutritionAggregate {
  date: string; // 'YYYY-MM-DD'
  totalCalories: number;
  totalProteinG: number;
  mealCount: number;
}

export interface PersonalRecordItem {
  id: string;
  exerciseName: string;
  recordType: string;
  weightKg: number;
  reps: number;
  volumeKg: number;
  estimated1rmKg: number;
  achievedAt: Date;
}

export interface IProgressTelemetryPort {
  getProfileGoals(userId: string): Promise<UserProfileProgressGoals | null>;
  getWorkoutSessions(userId: string, startDate: Date, endDate: Date): Promise<WorkoutSessionSummary[]>;
  getNutritionAggregates(userId: string, startDate: string, endDate: string): Promise<DailyNutritionAggregate[]>;
  getWaterTotals(userId: string, startDate: string, endDate: string): Promise<{ date: string; totalMl: number }[]>;
  getPersonalRecords(userId: string): Promise<PersonalRecordItem[]>;
}

