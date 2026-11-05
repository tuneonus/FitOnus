export const CALORIE_SOURCES = ['estimated', 'wearable', 'manual'] as const;
export type CalorieSource = (typeof CALORIE_SOURCES)[number];

export interface WorkoutSessionSetProps {
  id: string;
  sessionId: string;
  exerciseId: string;
  exerciseName?: string;
  setNumber: number;
  weightKg: number;
  reps: number;
  durationSeconds: number | null;
  isWarmup: boolean;
  isDropset: boolean;
  isFailure: boolean;
  isPr: boolean;
  rpe: number | null;
  notes: string | null;
  createdAt: Date;
}

export class WorkoutSessionSet {
  readonly id: string;
  readonly sessionId: string;
  readonly exerciseId: string;
  readonly exerciseName?: string;
  readonly setNumber: number;
  readonly weightKg: number;
  readonly reps: number;
  readonly durationSeconds: number | null;
  readonly isWarmup: boolean;
  readonly isDropset: boolean;
  readonly isFailure: boolean;
  readonly isPr: boolean;
  readonly rpe: number | null;
  readonly notes: string | null;
  readonly createdAt: Date;

  constructor(props: WorkoutSessionSetProps) {
    this.id = props.id;
    this.sessionId = props.sessionId;
    this.exerciseId = props.exerciseId;
    this.exerciseName = props.exerciseName;
    this.setNumber = props.setNumber;
    this.weightKg = props.weightKg;
    this.reps = props.reps;
    this.durationSeconds = props.durationSeconds;
    this.isWarmup = props.isWarmup;
    this.isDropset = props.isDropset;
    this.isFailure = props.isFailure;
    this.isPr = props.isPr;
    this.rpe = props.rpe;
    this.notes = props.notes;
    this.createdAt = props.createdAt;
  }

  get volumeKg(): number {
    return this.weightKg * this.reps;
  }

  get estimated1RM(): number {
    if (this.weightKg <= 0 || this.reps <= 0) return 0;
    if (this.reps === 1) return this.weightKg;
    return Number((this.weightKg * (1 + this.reps / 30)).toFixed(2));
  }
}

export interface WorkoutSessionProps {
  id: string;
  userId: string;
  workoutId: string | null;
  workoutName: string;
  startedAt: Date;
  completedAt: Date;
  durationSeconds: number;
  totalVolumeKg: number;
  totalSets: number;
  totalReps: number;
  caloriesBurned: number | null;
  caloriesSource: CalorieSource;
  difficultyRating: number | null;
  notes: string | null;
  isCompleted: boolean;
  sets?: WorkoutSessionSet[];
  createdAt: Date;
  updatedAt: Date;
}

export class WorkoutSession {
  readonly id: string;
  readonly userId: string;
  readonly workoutId: string | null;
  readonly workoutName: string;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly durationSeconds: number;
  readonly totalVolumeKg: number;
  readonly totalSets: number;
  readonly totalReps: number;
  readonly caloriesBurned: number | null;
  readonly caloriesSource: CalorieSource;
  readonly difficultyRating: number | null;
  readonly notes: string | null;
  readonly isCompleted: boolean;
  readonly sets: readonly WorkoutSessionSet[];
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: WorkoutSessionProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.workoutId = props.workoutId;
    this.workoutName = props.workoutName;
    this.startedAt = props.startedAt;
    this.completedAt = props.completedAt;
    this.durationSeconds = props.durationSeconds;
    this.totalVolumeKg = props.totalVolumeKg;
    this.totalSets = props.totalSets;
    this.totalReps = props.totalReps;
    this.caloriesBurned = props.caloriesBurned;
    this.caloriesSource = props.caloriesSource;
    this.difficultyRating = props.difficultyRating;
    this.notes = props.notes;
    this.isCompleted = props.isCompleted;
    this.sets = Object.freeze([...(props.sets ?? [])]);
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  get isCaloriesEstimated(): boolean {
    return this.caloriesSource === 'estimated';
  }
}

/**
 * Calculates total volume in kg from completed non-warmup sets.
 */
export function calculateTotalVolumeKg(
  sets: readonly { weightKg: number; reps: number; isWarmup?: boolean }[],
): number {
  return sets.reduce((sum, s) => {
    return sum + (s.weightKg > 0 && s.reps > 0 ? s.weightKg * s.reps : 0);
  }, 0);
}

/**
 * Calculates estimated calorie burn using standard MET formula.
 * @param durationMinutes Elapsed workout minutes
 * @param weightKg Optional user weight; falls back to 75kg reference standard (7.5 kcal/min)
 */
export function calculateEstimatedCalories(durationMinutes: number, weightKg?: number | null): number {
  const safeMinutes = Math.max(0, durationMinutes);
  if (weightKg && weightKg > 0) {
    // Standard resistance training MET ~ 5.5
    // Calories = Minutes * (MET * 3.5 * weightKg / 200)
    const met = 5.5;
    return Math.round(safeMinutes * ((met * 3.5 * weightKg) / 200));
  }
  // Default fallback: 7.5 kcal per minute
  return Math.round(safeMinutes * 7.5);
}
