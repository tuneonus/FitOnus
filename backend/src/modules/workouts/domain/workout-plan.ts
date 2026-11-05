import type { ExerciseDifficulty } from './exercise.js';

export interface WorkoutPlanExerciseProps {
  id: string;
  workoutId: string;
  exerciseId: string;
  orderIndex: number;
  targetSets: number;
  targetReps: string;
  targetDurationSeconds: number | null;
  targetWeightKg: number;
  restSeconds: number;
  notes: string | null;
  supersetGroup: number | null;
  createdAt: Date;
}

export class WorkoutPlanExercise {
  readonly id: string;
  readonly workoutId: string;
  readonly exerciseId: string;
  readonly orderIndex: number;
  readonly targetSets: number;
  readonly targetReps: string;
  readonly targetDurationSeconds: number | null;
  readonly targetWeightKg: number;
  readonly restSeconds: number;
  readonly notes: string | null;
  readonly supersetGroup: number | null;
  readonly createdAt: Date;

  constructor(props: WorkoutPlanExerciseProps) {
    this.id = props.id;
    this.workoutId = props.workoutId;
    this.exerciseId = props.exerciseId;
    this.orderIndex = props.orderIndex;
    this.targetSets = props.targetSets;
    this.targetReps = props.targetReps;
    this.targetDurationSeconds = props.targetDurationSeconds;
    this.targetWeightKg = props.targetWeightKg;
    this.restSeconds = props.restSeconds;
    this.notes = props.notes;
    this.supersetGroup = props.supersetGroup;
    this.createdAt = props.createdAt;
  }
}

export interface WorkoutPlanProps {
  id: string;
  userId: string | null; // Nullable for system templates
  name: string;
  description: string | null;
  workoutType: string;
  estimatedDurationMinutes: number;
  difficulty: ExerciseDifficulty;
  isTemplate: boolean;
  isAiGenerated: boolean;
  tags: string[];
  exercises?: WorkoutPlanExercise[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class WorkoutPlan {
  readonly id: string;
  readonly userId: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly workoutType: string;
  readonly estimatedDurationMinutes: number;
  readonly difficulty: ExerciseDifficulty;
  readonly isTemplate: boolean;
  readonly isAiGenerated: boolean;
  readonly tags: readonly string[];
  readonly exercises: readonly WorkoutPlanExercise[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;

  constructor(props: WorkoutPlanProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.name = props.name;
    this.description = props.description;
    this.workoutType = props.workoutType;
    this.estimatedDurationMinutes = props.estimatedDurationMinutes;
    this.difficulty = props.difficulty;
    this.isTemplate = props.isTemplate;
    this.isAiGenerated = props.isAiGenerated;
    this.tags = Object.freeze([...props.tags]);
    this.exercises = Object.freeze([...(props.exercises ?? [])]);
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.deletedAt = props.deletedAt;
  }

  isOwnedBy(userId: string): boolean {
    return this.userId === userId;
  }

  isSystemTemplate(): boolean {
    return this.isTemplate && this.userId === null;
  }
}
