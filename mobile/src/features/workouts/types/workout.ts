export type Exercise = {
  id: string;
  name: string;
  muscle?: 'Chest' | 'Back' | 'Legs' | 'Shoulders' | 'Arms' | 'Core' | 'Full body' | 'Cardio' | string;
  equipment: 'Barbell' | 'Dumbbell' | 'Cable' | 'Machine' | 'Bodyweight' | 'Kettlebell' | string;
  level?: 'Beginner' | 'Intermediate' | 'Advanced' | string;
  secondary?: string[];
  instructions?: string[];
  cues?: string[];
  image?: string;
  primaryMuscles?: string[];
  difficulty?: string;
  // Backend properties
  slug?: string;
  description?: string | null;
  category?: string;
  primaryMuscle?: string;
  secondaryMuscles?: string[];
  tips?: string[];
  videoUrl?: string | null;
  imageUrl?: string | null;
  isCustom?: boolean;
};

export type PlannedExercise = {
  exerciseId: string;
  sets: number;
  reps: string;
  weight: number; // kg, 0 = bodyweight
  restSec: number;
};

export type WorkoutSession = {
  id: string;
  title: string;
  focus: string;
  durationMin: number;
  intensity: string;
  exercises: PlannedExercise[];
};

export type SetLog = {
  id?: string;
  setNumber?: number;
  weight: number;
  reps: number;
  done?: boolean;
  isCompleted?: boolean;
  weightKg?: number;
  isWarmup?: boolean;
  rpe?: number | null;
};

export type ActiveExercise = {
  exerciseId: string;
  restSec: number;
  targetReps: string;
  sets: SetLog[];
  skipped: boolean;
};

export type WorkoutLog = {
  id: string;
  date: string;
  title: string;
  durationMin: number;
  volumeKg: number;
  sets: number;
  prs: number;
  calories: number;
  avgHr?: number;
  source: 'FitOnus' | 'Apple Watch' | 'Manual';
  exercises: { name: string; best: string }[];
  // Sync status
  pendingSync?: boolean;
  clientSessionId?: string;
  isCaloriesEstimated?: boolean;
  caloriesSource?: 'estimated' | 'wearable';
  completedAt?: string;
};

export type WorkoutCategory =
  | 'Fat Loss'
  | 'Muscle Gain'
  | 'Strength'
  | 'Home Workout'
  | 'Gym Workout'
  | 'Push Pull Legs'
  | 'Upper Lower Split'
  | 'Full Body'
  | 'Custom Plans';

// --- Backend Contract Types ---

export type WorkoutSessionSetPayload = {
  exerciseId: string;
  setNumber: number;
  weightKg: number;
  reps: number;
  isWarmup?: boolean;
  rpe?: number | null;
};

export type SaveWorkoutSessionInput = {
  clientSessionId: string;
  workoutName: string;
  planId?: string | null;
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  userWeightKg?: number;
  notes?: string;
  sets: WorkoutSessionSetPayload[];
};

export type WorkoutSessionResponse = {
  id: string;
  userId: string;
  planId: string | null;
  workoutName: string;
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  totalVolumeKg: number;
  totalSets: number;
  totalReps: number;
  estimatedCaloriesBurned: number;
  caloriesSource: 'estimated' | 'wearable';
  isCaloriesEstimated: boolean;
  notes: string | null;
  clientSessionId: string | null;
  sets: {
    id: string;
    exerciseId: string;
    exerciseName: string;
    setNumber: number;
    weightKg: number;
    reps: number;
    isWarmup: boolean;
    rpe: number | null;
  }[];
  personalRecords: {
    id: string;
    exerciseId: string;
    exerciseName: string;
    metricType: 'weight' | 'reps' | 'volume';
    value: number;
    weightKg: number | null;
    reps: number | null;
    isCurrentBest: boolean;
    achievedAt: string;
  }[];
  createdAt: string;
};

export type PersonalRecordView = {
  id: string;
  exerciseId: string;
  exerciseName: string;
  metricType: 'weight' | 'reps' | 'volume';
  value: number;
  weightKg: number | null;
  reps: number | null;
  isCurrentBest: boolean;
  achievedAt: string;
};

export type WorkoutPlanExerciseView = {
  id: string;
  exerciseId: string;
  orderIndex: number;
  targetSets: number;
  targetReps: string;
  targetRpe: number | null;
  restSeconds: number | null;
  notes: string | null;
  exerciseName: string;
  category: string;
  primaryMuscle: string;
  equipment: string;
};

export type WorkoutPlanSummaryView = {
  id: string;
  userId: string | null;
  name: string;
  description: string | null;
  isTemplate: boolean;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedDurationMinutes: number | null;
  tags: string[];
  exerciseCount: number;
  createdAt: string;
  updatedAt: string;
};

export type WorkoutPlanDetailView = WorkoutPlanSummaryView & {
  exercises: WorkoutPlanExerciseView[];
};

// Legacy compatibility types
export type LoggedSet = SetLog;
export type WorkoutExercise = any;
export type WorkoutDetail = any;
export type WorkoutTemplate = any;
