import { apiClient } from '@/services/api-client';
import type {
  Exercise,
  WorkoutPlanSummaryView,
  WorkoutPlanDetailView,
  SaveWorkoutSessionInput,
  WorkoutSessionResponse,
  PersonalRecordView,
} from '../types/workout';

export interface ExerciseListParams {
  search?: string;
  muscle?: string;
  category?: string;
  equipment?: string;
  difficulty?: string;
  page?: number;
  limit?: number;
}

export interface WorkoutPlansParams {
  type?: 'all' | 'mine' | 'templates';
  page?: number;
  limit?: number;
}

export interface WorkoutSessionsParams {
  page?: number;
  limit?: number;
}

export const workoutApi = {
  // 1. List Exercises
  async getExercises(params: ExerciseListParams = {}): Promise<{
    exercises: Exercise[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const res = await apiClient.get('/workouts/exercises', { params });
    const data = res.data?.data || [];
    const meta = res.data?.meta || {};
    return {
      exercises: data.map((ex: any) => ({
        id: ex.id,
        name: ex.name,
        muscle: ex.primaryMuscle ? (ex.primaryMuscle.charAt(0).toUpperCase() + ex.primaryMuscle.slice(1)) : 'Full body',
        equipment: ex.equipment ? (ex.equipment.charAt(0).toUpperCase() + ex.equipment.slice(1)) : 'Barbell',
        level: ex.difficulty ? (ex.difficulty.charAt(0).toUpperCase() + ex.difficulty.slice(1)) : 'Intermediate',
        difficulty: ex.difficulty,
        secondary: ex.secondaryMuscles || [],
        primaryMuscles: ex.primaryMuscle ? [ex.primaryMuscle] : [],
        instructions: ex.instructions || [],
        cues: ex.tips || [],
        image: ex.imageUrl || undefined,
        slug: ex.slug,
        description: ex.description,
        category: ex.category,
        primaryMuscle: ex.primaryMuscle,
        secondaryMuscles: ex.secondaryMuscles,
        tips: ex.tips,
        videoUrl: ex.videoUrl,
        imageUrl: ex.imageUrl,
        isCustom: ex.isCustom,
      })),
      total: meta.total ?? data.length,
      page: meta.page ?? 1,
      totalPages: meta.totalPages ?? 1,
    };
  },

  // 2. Get Exercise Detail
  async getExerciseById(id: string): Promise<Exercise> {
    const res = await apiClient.get(`/workouts/exercises/${id}`);
    const ex = res.data?.data;
    return {
      id: ex.id,
      name: ex.name,
      muscle: ex.primaryMuscle ? (ex.primaryMuscle.charAt(0).toUpperCase() + ex.primaryMuscle.slice(1)) : 'Full body',
      equipment: ex.equipment ? (ex.equipment.charAt(0).toUpperCase() + ex.equipment.slice(1)) : 'Barbell',
      level: ex.difficulty ? (ex.difficulty.charAt(0).toUpperCase() + ex.difficulty.slice(1)) : 'Intermediate',
      difficulty: ex.difficulty,
      secondary: ex.secondaryMuscles || [],
      primaryMuscles: ex.primaryMuscle ? [ex.primaryMuscle] : [],
      instructions: ex.instructions || [],
      cues: ex.tips || [],
      image: ex.imageUrl || undefined,
      slug: ex.slug,
      description: ex.description,
      category: ex.category,
      primaryMuscle: ex.primaryMuscle,
      secondaryMuscles: ex.secondaryMuscles,
      tips: ex.tips,
      videoUrl: ex.videoUrl,
      imageUrl: ex.imageUrl,
      isCustom: ex.isCustom,
    };
  },

  // 3. List Workout Plans / Templates
  async getWorkoutPlans(params: WorkoutPlansParams = {}): Promise<{
    plans: WorkoutPlanSummaryView[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const res = await apiClient.get('/workouts/plans', { params });
    const data = res.data?.data || [];
    const meta = res.data?.meta || {};
    return {
      plans: data,
      total: meta.total ?? data.length,
      page: meta.page ?? 1,
      totalPages: meta.totalPages ?? 1,
    };
  },

  // 4. Get Workout Plan Detail
  async getWorkoutPlanById(id: string): Promise<WorkoutPlanDetailView> {
    const res = await apiClient.get(`/workouts/plans/${id}`);
    return res.data?.data;
  },

  // 5. Create Workout Plan
  async createWorkoutPlan(data: {
    name: string;
    description?: string;
    difficulty?: 'beginner' | 'intermediate' | 'advanced';
    estimatedDurationMinutes?: number;
    tags?: string[];
    exercises: {
      exerciseId: string;
      orderIndex: number;
      targetSets: number;
      targetReps: string;
      targetRpe?: number;
      restSeconds?: number;
      notes?: string;
    }[];
  }): Promise<WorkoutPlanDetailView> {
    const res = await apiClient.post('/workouts/plans', data);
    return res.data?.data;
  },

  // 6. Save Completed Workout Session (Atomic & Idempotent)
  async saveWorkoutSession(
    payload: SaveWorkoutSessionInput,
    idempotencyKey?: string
  ): Promise<WorkoutSessionResponse> {
    const headers: Record<string, string> = {};
    if (idempotencyKey || payload.clientSessionId) {
      headers['Idempotency-Key'] = idempotencyKey || payload.clientSessionId;
    }

    const res = await apiClient.post('/workouts/sessions', payload, { headers });
    return res.data?.data;
  },

  // 7. List Completed Workout Sessions
  async getWorkoutSessions(params: WorkoutSessionsParams = {}): Promise<{
    sessions: any[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const res = await apiClient.get('/workouts/sessions', { params });
    const data = res.data?.data || [];
    const meta = res.data?.meta || {};
    return {
      sessions: data,
      total: meta.total ?? data.length,
      page: meta.page ?? 1,
      totalPages: meta.totalPages ?? 1,
    };
  },

  // 8. Get Completed Session Detail
  async getSessionById(id: string): Promise<WorkoutSessionResponse> {
    const res = await apiClient.get(`/workouts/sessions/${id}`);
    return res.data?.data;
  },

  // 9. Personal Records
  async getPersonalRecords(exerciseId?: string, type: 'bests' | 'history' = 'bests'): Promise<PersonalRecordView[]> {
    const res = await apiClient.get('/workouts/records', {
      params: { exerciseId, type },
    });
    return res.data?.data || [];
  },
};
