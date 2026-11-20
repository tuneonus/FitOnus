export interface Exercise {
  id: string;
  name: string;
  slug?: string;
  description: string | null;
  category: 'strength' | 'hypertrophy' | 'endurance' | 'mobility' | 'cardio' | string;
  primaryMuscles: string[];
  primaryMuscle?: string;
  secondaryMuscles: string[];
  equipment: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  isCompound: boolean;
  instructions: string[];
  tips: string[];
  commonMistakes?: string[];
  videoUrl: string | null;
  /** The picture to show: the uploaded image when there is one, otherwise the external address. */
  imageUrl: string | null;
  /** Key of the uploaded image, or null. Absent from a backend that predates uploads. */
  imageKey?: string | null;
  /** The external address an admin typed (http or https), or null. Absent from a backend that predates uploads. */
  externalImageUrl?: string | null;
  isSystem: boolean;
  isCustom?: boolean;
  userId?: string | null;
  createdBy?: string | null;
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
  category: 'strength' | 'hypertrophy' | 'endurance' | 'mobility' | 'cardio' | string;
  primaryMuscles: string[];
  primaryMuscle?: string;
  secondaryMuscles?: string[];
  equipment: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  isCompound?: boolean;
  instructions: string[];
  tips?: string[];
  commonMistakes?: string[];
  videoUrl?: string | null;
  /** External address (http or https). */
  imageUrl?: string | null;
  /** Key returned by the exercise image upload; null = no uploaded image. */
  imageKey?: string | null;
}

export interface UpdateExerciseInput {
  name?: string;
  description?: string | null;
  category?: 'strength' | 'hypertrophy' | 'endurance' | 'mobility' | 'cardio' | string;
  primaryMuscles?: string[];
  primaryMuscle?: string;
  secondaryMuscles?: string[];
  equipment?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  isCompound?: boolean;
  instructions?: string[];
  tips?: string[];
  commonMistakes?: string[];
  videoUrl?: string | null;
  /** External address (http or https). */
  imageUrl?: string | null;
  /** Key returned by the exercise image upload; null removes the uploaded image. Omitted = unchanged. */
  imageKey?: string | null;
}

/** What the exercise image upload endpoint returns for an accepted image. */
export interface UploadedExerciseImage {
  imageKey: string;
  /** Public URL of the stored image. */
  imageUrl: string;
  /** Whatever was uploaded, the stored image is an optimized WebP with no metadata. */
  contentType: 'image/webp';
  sizeBytes: number;
  width: number;
  height: number;
  /** What was uploaded, before conversion. */
  source: { format: 'jpeg' | 'png' | 'webp' | 'heic'; bytes: number; width: number; height: number };
}

/** What the template cover upload endpoint returns: the same shape as an exercise image upload. */
export type UploadedTemplateCover = UploadedExerciseImage;

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
  /** Public URL of the template's cover image, or null. Absent from a backend that predates covers. */
  coverImageUrl?: string | null;
  /** Key of the cover image, or null. Absent from a backend that predates covers. */
  coverImageKey?: string | null;
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
  /** Key returned by the template cover upload; null = no cover. */
  coverImageKey?: string | null;
  exercises: TemplateExerciseInput[];
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string | null;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  estimatedDurationMinutes?: number | null;
  tags?: string[];
  /** Key returned by the template cover upload; null removes the cover. Omitted = unchanged. */
  coverImageKey?: string | null;
  exercises?: TemplateExerciseInput[];
}

export interface WorkoutStats {
  totalExercises: number;
  totalSystemTemplates: number;
  totalCompletedSessions: number;
  totalVolumeLiftedKg: number;
  activeLiftersCount: number;
  totalTemplates?: number;
  totalSessions?: number;
  totalVolumeKg?: number;
}
