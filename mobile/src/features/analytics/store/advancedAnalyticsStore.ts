/**
 * Advanced Analytics Zustand Store
 *
 * Provides strongly typed state management, client caching,
 * stale-request sequence ID protection, user isolation, and
 * error handling for FitOnus Advanced Analytics.
 */

import { create } from 'zustand';
import { analyticsApi } from '../api/analytics-api';
import type {
  ActivityOverviewView,
  AnalyticsRange,
  BodyAnalyticsView,
  ExerciseProgressionView,
  GoalsHabitsAnalyticsView,
  HydrationAnalyticsView,
  NutritionAnalyticsView,
  WorkoutAnalyticsView,
} from '../types/analytics';
import { logger } from '@/utils/logger';

export interface AdvancedAnalyticsState {
  // Domain data models
  overview: ActivityOverviewView | null;
  workouts: Record<string, WorkoutAnalyticsView>;
  exerciseProgression: Record<string, ExerciseProgressionView>;
  nutrition: Record<string, NutritionAnalyticsView>;
  hydration: Record<string, HydrationAnalyticsView>;
  body: Record<string, BodyAnalyticsView>;
  goalsHabits: GoalsHabitsAnalyticsView | null;

  // Loading and error states
  loading: Record<string, boolean>;
  errors: Record<string, string | null>;
  isRefreshing: boolean;

  // Actions
  fetchOverview: (force?: boolean) => Promise<ActivityOverviewView | null>;
  fetchWorkouts: (range?: AnalyticsRange | string, force?: boolean) => Promise<WorkoutAnalyticsView | null>;
  fetchExerciseProgression: (
    exerciseId: string,
    range?: AnalyticsRange | string,
    force?: boolean
  ) => Promise<ExerciseProgressionView | null>;
  fetchNutrition: (range?: AnalyticsRange | string, force?: boolean) => Promise<NutritionAnalyticsView | null>;
  fetchHydration: (range?: AnalyticsRange | string, force?: boolean) => Promise<HydrationAnalyticsView | null>;
  fetchBody: (range?: AnalyticsRange | string, force?: boolean) => Promise<BodyAnalyticsView | null>;
  fetchGoalsHabits: (windowDays?: number, force?: boolean) => Promise<GoalsHabitsAnalyticsView | null>;

  refreshAll: () => Promise<void>;
  resetStore: () => void;
}

// Global monotonic request sequence counter per domain key for stale-request protection
const requestSeqMap: Record<string, number> = {};

function nextSequenceId(domainKey: string): number {
  requestSeqMap[domainKey] = (requestSeqMap[domainKey] || 0) + 1;
  return requestSeqMap[domainKey];
}

function isCurrentSequence(domainKey: string, seq: number): boolean {
  return requestSeqMap[domainKey] === seq;
}

export const useAdvancedAnalyticsStore = create<AdvancedAnalyticsState>((set, get) => ({
  overview: null,
  workouts: {},
  exerciseProgression: {},
  nutrition: {},
  hydration: {},
  body: {},
  goalsHabits: null,

  loading: {},
  errors: {},
  isRefreshing: false,

  resetStore: () => {
    // Invalidate any in-flight requests
    Object.keys(requestSeqMap).forEach((k) => {
      requestSeqMap[k] = (requestSeqMap[k] || 0) + 1;
    });

    set({
      overview: null,
      workouts: {},
      exerciseProgression: {},
      nutrition: {},
      hydration: {},
      body: {},
      goalsHabits: null,
      loading: {},
      errors: {},
      isRefreshing: false,
    });
  },

  fetchOverview: async (force = false) => {
    const domainKey = 'overview';
    if (!force && get().overview) {
      return get().overview;
    }

    const seq = nextSequenceId(domainKey);
    set((state) => ({
      loading: { ...state.loading, [domainKey]: true },
      errors: { ...state.errors, [domainKey]: null },
    }));

    try {
      const data = await analyticsApi.getOverview();
      if (!isCurrentSequence(domainKey, seq)) return null;

      set((state) => ({
        overview: data,
        loading: { ...state.loading, [domainKey]: false },
      }));
      return data;
    } catch (err: any) {
      if (!isCurrentSequence(domainKey, seq)) return null;
      const msg = err?.message || 'Failed to fetch analytics overview';
      logger.warn('[AdvancedAnalytics] fetchOverview error:', msg);
      set((state) => ({
        errors: { ...state.errors, [domainKey]: msg },
        loading: { ...state.loading, [domainKey]: false },
      }));
      return null;
    }
  },

  fetchWorkouts: async (range: AnalyticsRange | string = 'M', force = false) => {
    const rangeKey = String(range);
    const domainKey = `workouts-${rangeKey}`;
    const cached = get().workouts[rangeKey];
    if (!force && cached) {
      return cached;
    }

    const seq = nextSequenceId(domainKey);
    set((state) => ({
      loading: { ...state.loading, [domainKey]: true },
      errors: { ...state.errors, [domainKey]: null },
    }));

    try {
      const data = await analyticsApi.getWorkouts({ range });
      if (!isCurrentSequence(domainKey, seq)) return null;

      set((state) => ({
        workouts: { ...state.workouts, [rangeKey]: data },
        loading: { ...state.loading, [domainKey]: false },
      }));
      return data;
    } catch (err: any) {
      if (!isCurrentSequence(domainKey, seq)) return null;
      const msg = err?.message || `Failed to fetch workout analytics for ${range}`;
      logger.warn('[AdvancedAnalytics] fetchWorkouts error:', msg);
      set((state) => ({
        errors: { ...state.errors, [domainKey]: msg },
        loading: { ...state.loading, [domainKey]: false },
      }));
      return null;
    }
  },

  fetchExerciseProgression: async (
    exerciseId: string,
    range: AnalyticsRange | string = 'all',
    force = false
  ) => {
    const cacheKey = `${exerciseId}-${range}`;
    const domainKey = `progression-${cacheKey}`;
    const cached = get().exerciseProgression[cacheKey];
    if (!force && cached) {
      return cached;
    }

    const seq = nextSequenceId(domainKey);
    set((state) => ({
      loading: { ...state.loading, [domainKey]: true },
      errors: { ...state.errors, [domainKey]: null },
    }));

    try {
      const data = await analyticsApi.getExerciseProgression(exerciseId, { range });
      if (!isCurrentSequence(domainKey, seq)) return null;

      set((state) => ({
        exerciseProgression: { ...state.exerciseProgression, [cacheKey]: data },
        loading: { ...state.loading, [domainKey]: false },
      }));
      return data;
    } catch (err: any) {
      if (!isCurrentSequence(domainKey, seq)) return null;
      const msg = err?.message || `Failed to fetch progression for ${exerciseId}`;
      logger.warn('[AdvancedAnalytics] fetchExerciseProgression error:', msg);
      set((state) => ({
        errors: { ...state.errors, [domainKey]: msg },
        loading: { ...state.loading, [domainKey]: false },
      }));
      return null;
    }
  },

  fetchNutrition: async (range: AnalyticsRange | string = 'W', force = false) => {
    const rangeKey = String(range);
    const domainKey = `nutrition-${rangeKey}`;
    const cached = get().nutrition[rangeKey];
    if (!force && cached) {
      return cached;
    }

    const seq = nextSequenceId(domainKey);
    set((state) => ({
      loading: { ...state.loading, [domainKey]: true },
      errors: { ...state.errors, [domainKey]: null },
    }));

    try {
      const data = await analyticsApi.getNutrition({ range });
      if (!isCurrentSequence(domainKey, seq)) return null;

      set((state) => ({
        nutrition: { ...state.nutrition, [rangeKey]: data },
        loading: { ...state.loading, [domainKey]: false },
      }));
      return data;
    } catch (err: any) {
      if (!isCurrentSequence(domainKey, seq)) return null;
      const msg = err?.message || `Failed to fetch nutrition analytics for ${range}`;
      logger.warn('[AdvancedAnalytics] fetchNutrition error:', msg);
      set((state) => ({
        errors: { ...state.errors, [domainKey]: msg },
        loading: { ...state.loading, [domainKey]: false },
      }));
      return null;
    }
  },

  fetchHydration: async (range: AnalyticsRange | string = 'W', force = false) => {
    const rangeKey = String(range);
    const domainKey = `hydration-${rangeKey}`;
    const cached = get().hydration[rangeKey];
    if (!force && cached) {
      return cached;
    }

    const seq = nextSequenceId(domainKey);
    set((state) => ({
      loading: { ...state.loading, [domainKey]: true },
      errors: { ...state.errors, [domainKey]: null },
    }));

    try {
      const data = await analyticsApi.getHydration({ range });
      if (!isCurrentSequence(domainKey, seq)) return null;

      set((state) => ({
        hydration: { ...state.hydration, [rangeKey]: data },
        loading: { ...state.loading, [domainKey]: false },
      }));
      return data;
    } catch (err: any) {
      if (!isCurrentSequence(domainKey, seq)) return null;
      const msg = err?.message || `Failed to fetch hydration analytics for ${range}`;
      logger.warn('[AdvancedAnalytics] fetchHydration error:', msg);
      set((state) => ({
        errors: { ...state.errors, [domainKey]: msg },
        loading: { ...state.loading, [domainKey]: false },
      }));
      return null;
    }
  },

  fetchBody: async (range: AnalyticsRange | string = 'M', force = false) => {
    const rangeKey = String(range);
    const domainKey = `body-${rangeKey}`;
    const cached = get().body[rangeKey];
    if (!force && cached) {
      return cached;
    }

    const seq = nextSequenceId(domainKey);
    set((state) => ({
      loading: { ...state.loading, [domainKey]: true },
      errors: { ...state.errors, [domainKey]: null },
    }));

    try {
      const data = await analyticsApi.getBody({ range });
      if (!isCurrentSequence(domainKey, seq)) return null;

      set((state) => ({
        body: { ...state.body, [rangeKey]: data },
        loading: { ...state.loading, [domainKey]: false },
      }));
      return data;
    } catch (err: any) {
      if (!isCurrentSequence(domainKey, seq)) return null;
      const msg = err?.message || `Failed to fetch body analytics for ${range}`;
      logger.warn('[AdvancedAnalytics] fetchBody error:', msg);
      set((state) => ({
        errors: { ...state.errors, [domainKey]: msg },
        loading: { ...state.loading, [domainKey]: false },
      }));
      return null;
    }
  },

  fetchGoalsHabits: async (windowDays = 30, force = false) => {
    const domainKey = `goalsHabits-${windowDays}`;
    const cached = get().goalsHabits;
    if (!force && cached) {
      return cached;
    }

    const seq = nextSequenceId(domainKey);
    set((state) => ({
      loading: { ...state.loading, [domainKey]: true },
      errors: { ...state.errors, [domainKey]: null },
    }));

    try {
      const data = await analyticsApi.getGoalsHabits({ windowDays });
      if (!isCurrentSequence(domainKey, seq)) return null;

      set((state) => ({
        goalsHabits: data,
        loading: { ...state.loading, [domainKey]: false },
      }));
      return data;
    } catch (err: any) {
      if (!isCurrentSequence(domainKey, seq)) return null;
      const msg = err?.message || 'Failed to fetch goals and habits analytics';
      logger.warn('[AdvancedAnalytics] fetchGoalsHabits error:', msg);
      set((state) => ({
        errors: { ...state.errors, [domainKey]: msg },
        loading: { ...state.loading, [domainKey]: false },
      }));
      return null;
    }
  },

  refreshAll: async () => {
    set({ isRefreshing: true });
    try {
      await Promise.allSettled([
        get().fetchOverview(true),
        get().fetchWorkouts('M', true),
        get().fetchNutrition('W', true),
        get().fetchHydration('W', true),
        get().fetchBody('M', true),
        get().fetchGoalsHabits(30, true),
      ]);
    } finally {
      set({ isRefreshing: false });
    }
  },
}));

