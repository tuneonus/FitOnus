export interface WorkoutTemplate {
  id: string;
  name: string;
  description: string;
  estimatedDuration: number;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  tags: string[];
  exercisesCount: number;
  isAiGenerated?: boolean;
}

export interface Exercise {
  id: string;
  name: string;
  primaryMuscles: string[];
  equipment: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  imageUrl?: string;
}

export interface WorkoutExercise {
  id: string;
  exercise: Exercise;
  targetSets: number;
  targetReps: number | string; // e.g., 10 or '8-12'
  restSeconds: number;
}

export interface WorkoutDetail extends WorkoutTemplate {
  exercises: WorkoutExercise[];
}

export interface LoggedSet {
  id: string;
  setNumber: number;
  weightKg?: number;
  reps?: number;
  isCompleted: boolean;
  isPR?: boolean;
}
