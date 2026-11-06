import { apiClient } from '@/services/api-client';
import type {
  Goal,
  GoalDetails,
  GoalCheckpoint,
  Habit,
  HabitHistory,
  CreateGoalInput,
  UpdateGoalInput,
  LogGoalCheckpointInput,
  CreateHabitInput,
  UpdateHabitInput,
  SetHabitCompletionInput,
} from '../types/goal';
import { logger } from '@/utils/logger';

export interface GetGoalsParams {
  status?: string | undefined;
  isPrimary?: boolean | undefined;
  syncTelemetry?: boolean | undefined;
}

export interface GetHabitsParams {
  category?: string | undefined;
  isArchived?: boolean | undefined;
  date?: string | undefined;
}

export const goalsApi = {
  // --- Goals Endpoints ---

  /**
   * Fetch goals list for the authenticated user.
   */
  async getGoals(params?: GetGoalsParams): Promise<Goal[]> {
    try {
      const res = await apiClient.get('/goals', { params });
      return res.data?.data ?? [];
    } catch (err) {
      logger.error('Failed to fetch goals:', err);
      throw err;
    }
  },

  /**
   * Fetch goal details, milestone checkpoints, and recent progression points.
   */
  async getGoalDetails(id: string): Promise<GoalDetails> {
    try {
      const res = await apiClient.get(`/goals/${id}`);
      return res.data?.data;
    } catch (err) {
      logger.error(`Failed to fetch goal details for ${id}:`, err);
      throw err;
    }
  },

  /**
   * Create a new fitness or wellness goal.
   */
  async createGoal(payload: CreateGoalInput): Promise<Goal> {
    try {
      const res = await apiClient.post('/goals', payload);
      return res.data?.data;
    } catch (err) {
      logger.error('Failed to create goal:', err);
      throw err;
    }
  },

  /**
   * Update an existing goal.
   */
  async updateGoal(id: string, payload: UpdateGoalInput): Promise<Goal> {
    try {
      const res = await apiClient.patch(`/goals/${id}`, payload);
      return res.data?.data;
    } catch (err) {
      logger.error(`Failed to update goal ${id}:`, err);
      throw err;
    }
  },

  /**
   * Soft-delete a user goal.
   */
  async deleteGoal(id: string): Promise<{ id: string; success: boolean }> {
    try {
      const res = await apiClient.delete(`/goals/${id}`);
      return res.data?.data;
    } catch (err) {
      logger.error(`Failed to delete goal ${id}:`, err);
      throw err;
    }
  },

  /**
   * Evaluate deterministic goal progress.
   */
  async calculateProgress(
    id: string,
    candidateValue?: number,
  ): Promise<{
    goalId: string;
    startValue: number;
    currentValue: number;
    targetValue: number;
    progress: number;
    percentage: number;
    isCompleted: boolean;
  }> {
    try {
      const res = await apiClient.post(`/goals/${id}/progress`, { candidateValue });
      return res.data?.data;
    } catch (err) {
      logger.error(`Failed to calculate progress for goal ${id}:`, err);
      throw err;
    }
  },

  /**
   * Get milestone checkpoints for a goal.
   */
  async getCheckpoints(id: string, limit = 20): Promise<GoalCheckpoint[]> {
    try {
      const res = await apiClient.get(`/goals/${id}/checkpoints`, { params: { limit } });
      return res.data?.data ?? [];
    } catch (err) {
      logger.error(`Failed to fetch checkpoints for goal ${id}:`, err);
      throw err;
    }
  },

  /**
   * Log a new checkpoint milestone for a goal.
   */
  async logCheckpoint(id: string, payload: LogGoalCheckpointInput): Promise<GoalCheckpoint> {
    try {
      const res = await apiClient.post(`/goals/${id}/checkpoints`, payload);
      return res.data?.data;
    } catch (err) {
      logger.error(`Failed to log checkpoint for goal ${id}:`, err);
      throw err;
    }
  },

  // --- Habits Endpoints ---

  /**
   * Fetch habits list for the authenticated user.
   */
  async getHabits(params?: GetHabitsParams): Promise<Habit[]> {
    try {
      const res = await apiClient.get('/habits', { params });
      return res.data?.data ?? [];
    } catch (err) {
      logger.error('Failed to fetch habits:', err);
      throw err;
    }
  },

  /**
   * Fetch habit history, streaks, and completion dates.
   */
  async getHabitHistory(id: string, limitDays = 90): Promise<HabitHistory> {
    try {
      const res = await apiClient.get(`/habits/${id}`, { params: { limitDays } });
      return res.data?.data;
    } catch (err) {
      logger.error(`Failed to fetch habit history for ${id}:`, err);
      throw err;
    }
  },

  /**
   * Create a new daily or weekly habit.
   */
  async createHabit(payload: CreateHabitInput): Promise<Habit> {
    try {
      const res = await apiClient.post('/habits', payload);
      return res.data?.data;
    } catch (err) {
      logger.error('Failed to create habit:', err);
      throw err;
    }
  },

  /**
   * Update habit details or archive status.
   */
  async updateHabit(id: string, payload: UpdateHabitInput): Promise<Habit> {
    try {
      const res = await apiClient.patch(`/habits/${id}`, payload);
      return res.data?.data;
    } catch (err) {
      logger.error(`Failed to update habit ${id}:`, err);
      throw err;
    }
  },

  /**
   * Soft-delete a habit.
   */
  async deleteHabit(id: string): Promise<{ id: string; success: boolean }> {
    try {
      const res = await apiClient.delete(`/habits/${id}`);
      return res.data?.data;
    } catch (err) {
      logger.error(`Failed to delete habit ${id}:`, err);
      throw err;
    }
  },

  /**
   * Explicitly set habit completion state (true/false) for a date.
   */
  async setHabitCompletion(
    id: string,
    payload: SetHabitCompletionInput,
  ): Promise<{
    habit: Habit;
    date: string;
    completed: boolean;
    streaks: { currentStreak: number; longestStreak: number; totalCompletions: number };
  }> {
    try {
      const res = await apiClient.post(`/habits/${id}/completion`, payload);
      return res.data?.data;
    } catch (err) {
      logger.error(`Failed to set completion for habit ${id}:`, err);
      throw err;
    }
  },

  /**
   * Calculate habit streaks for a reference date.
   */
  async getHabitStreaks(
    id: string,
    referenceDate?: string,
  ): Promise<{ currentStreak: number; longestStreak: number; totalCompletions: number }> {
    try {
      const res = await apiClient.get(`/habits/${id}/streaks`, { params: { referenceDate } });
      return res.data?.data;
    } catch (err) {
      logger.error(`Failed to fetch streaks for habit ${id}:`, err);
      throw err;
    }
  },
};
