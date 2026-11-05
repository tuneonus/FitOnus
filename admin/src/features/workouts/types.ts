export interface Exercise {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: 'strength' | 'hypertrophy' | 'endurance' | 'mobility' | 'cardio';
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  instructions: string[];
  tips: string[];
  videoUrl: string | null;
  imageUrl: string | null;
  isCustom: boolean;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExerciseListQuery {
  page?: number;
  limit?: number;
  search?: string;
  muscle?: string;
  category?: string;
  equipment?: string;
  difficulty?: string;
}

export interface CreateExerciseInput {
  name: string;
  description?: string | null;
  category: 'strength' | 'hypertrophy' | 'endurance' | 'mobility' | 'cardio';
  primaryMuscle: string;
  secondaryMuscles?: string[];
  equipment: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  instructions?: string[];
  tips?: string[];
  videoUrl?: string | null;
  imageUrl?: string | null;
}

export interface UpdateExerciseInput {
  name?: string;
  description?: string | null;
  category?: 'strength' | 'hypertrophy' | 'endurance' | 'mobility' | 'cardio';
  primaryMuscle?: string;
  secondaryMuscles?: string[];
  equipment?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  instructions?: string[];
  tips?: string[];
  videoUrl?: string | null;
  imageUrl?: string | null;
}

export interface WorkoutTemplateExercise {
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
}

export interface WorkoutTemplate {
  id: string;
  userId: string | null;
  name: string;
  description: string | null;
  isTemplate: boolean;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedDurationMinutes: number | null;
  tags: string[];
  exerciseCount: number;
  exercises: WorkoutTemplateExercise[];
  createdAt: string;
  updatedAt: string;
}

export interface TemplateListQuery {
  page?: number;
  limit?: number;
}

export interface TemplateExerciseInput {
  exerciseId: string;
  orderIndex: number;
  targetSets: number;
  targetReps: string;
  targetRpe?: number | null;
  restSeconds?: number | null;
  notes?: string | null;
}

export interface CreateTemplateInput {
  name: string;
  description?: string | null;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  estimatedDurationMinutes?: number | null;
  tags?: string[];
  exercises: TemplateExerciseInput[];
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string | null;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  estimatedDurationMinutes?: number | null;
  tags?: string[];
  exercises?: TemplateExerciseInput[];
}

export interface WorkoutStats {
  totalExercises: number;
  systemExercises: number;
  customExercises: number;
  totalTemplates: number;
  totalSessions: number;
  totalVolumeKg: number;
}
