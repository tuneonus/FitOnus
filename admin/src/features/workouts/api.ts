import { apiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types';
import type {
  Exercise,
  ExerciseListQuery,
  CreateExerciseInput,
  UpdateExerciseInput,
  WorkoutTemplate,
  TemplateListQuery,
  CreateTemplateInput,
  UpdateTemplateInput,
  WorkoutStats,
} from './types';

export const workoutsApi = {
  // Exercises
  async listExercises(
    params: ExerciseListQuery = {}
  ): Promise<{ exercises: Exercise[]; meta: ApiResponse<unknown>['meta'] }> {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', params.page.toString());
    if (params.limit) searchParams.set('limit', params.limit.toString());
    if (params.search) searchParams.set('search', params.search);
    if (params.muscle) searchParams.set('muscle', params.muscle);
    if (params.category) searchParams.set('category', params.category);
    if (params.equipment) searchParams.set('equipment', params.equipment);
    if (params.difficulty) searchParams.set('difficulty', params.difficulty);

    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    const res = await apiClient<Exercise[]>(`/workouts/exercises${query}`, {
      method: 'GET',
    });

    return {
      exercises: res.data,
      meta: res.meta,
    };
  },

  async createExercise(data: CreateExerciseInput): Promise<Exercise> {
    const res = await apiClient<Exercise>('/workouts/exercises', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async updateExercise(id: string, data: UpdateExerciseInput): Promise<Exercise> {
    const res = await apiClient<Exercise>(`/workouts/exercises/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async deleteExercise(id: string): Promise<void> {
    await apiClient(`/workouts/exercises/${id}`, {
      method: 'DELETE',
    });
  },

  // Templates
  async listTemplates(
    params: TemplateListQuery = {}
  ): Promise<{ templates: WorkoutTemplate[]; meta: ApiResponse<unknown>['meta'] }> {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', params.page.toString());
    if (params.limit) searchParams.set('limit', params.limit.toString());

    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    const res = await apiClient<WorkoutTemplate[]>(`/workouts/templates${query}`, {
      method: 'GET',
    });

    return {
      templates: res.data,
      meta: res.meta,
    };
  },

  async createTemplate(data: CreateTemplateInput): Promise<WorkoutTemplate> {
    const res = await apiClient<WorkoutTemplate>('/workouts/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async updateTemplate(id: string, data: UpdateTemplateInput): Promise<WorkoutTemplate> {
    const res = await apiClient<WorkoutTemplate>(`/workouts/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async deleteTemplate(id: string): Promise<void> {
    await apiClient(`/workouts/templates/${id}`, {
      method: 'DELETE',
    });
  },

  // Analytics Stats
  async getWorkoutStats(): Promise<WorkoutStats> {
    const res = await apiClient<WorkoutStats>('/workouts/stats', {
      method: 'GET',
    });
    return res.data;
  },
};

