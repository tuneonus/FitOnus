import { captureUserSession, sessionSetter, registerUserStore } from '@/services/user-session';
import { create } from 'zustand';
import type { MeasurementEntry, WeightEntry } from '../types/weight';
import type { ChartPoint, TimeRange } from '@/shared/types/health';
import {
  sanitizeMeasurementInput,
  type LogMeasurementInput,
  type LogWeightInput,
  type MeasurementDiffs,
  type WeightSummary,
} from '@/features/progress/types/progress';
import { progressApi } from '@/features/progress/api/progress-api';
import { progressOfflineSync } from '@/features/progress/services/progress-offline-sync';
import { generateUUID } from '@/features/nutrition/utils/uuid';
import { refreshFitnessQueries } from '@/services/fitness-refresh';
import { logger } from '@/utils/logger';

/**
 * The history API lists entries newest-first (ORDER BY logged_at DESC). This store and its
 * screens treat the array as oldest → newest (latest = last item; new logs are appended),
 * so normalise once at ingest.
 */
const toChronological = <T,>(entries: T[]): T[] => [...entries].reverse();

export interface WeightState {
  entries: WeightEntry[];
  measurements: MeasurementEntry[];
  goalWeight: number | null;
  startWeight: number | null;
  currentRange: TimeRange;
  points: ChartPoint[];
  summary: WeightSummary | null;
  measurementDiffs: MeasurementDiffs;
  isLoading: boolean;
  isSyncing: boolean;
  error: string | null;

  // Actions
  fetchWeightHistory: (range?: TimeRange, force?: boolean) => Promise<void>;
  fetchMeasurements: (force?: boolean) => Promise<void>;
  addEntry: (value: number, note?: string | undefined) => Promise<'synced' | 'queued'>;
  undoLast: (previous: WeightEntry | undefined) => void;
  deleteEntry: (id: string) => Promise<boolean>;
  addMeasurement: (entry: MeasurementEntry) => Promise<'synced' | 'queued'>;
  deleteMeasurement: (id: string) => Promise<boolean>;
  syncPending: () => Promise<void>;
  resetStore: () => void;
  init: () => () => void;
}

const defaultGoalWeight = null;
const defaultStartWeight = null;

export const useWeightStore = create<WeightState>((storeSet, get) => {
  const set = storeSet;
  return {
    entries: [],
    measurements: [],
    goalWeight: defaultGoalWeight,
    startWeight: defaultStartWeight,
    currentRange: 'W',
    points: [],
    summary: null,
    measurementDiffs: {},
    isLoading: false,
    isSyncing: false,
    error: null,

    resetStore: () => {
      set({
        goalWeight: null,
        startWeight: null,
        entries: [],
        measurements: [],
        points: [],
        summary: null,
        measurementDiffs: {},
        isLoading: false,
        isSyncing: false,
        error: null,
        currentRange: 'W',
      });
    },

    fetchWeightHistory: async (range: TimeRange = get().currentRange, force = false) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      set({ isLoading: true, error: null, currentRange: range });

      // 1. Load from cache first for instant rendering
      if (!force) {
        const cached = await progressOfflineSync.getCachedWeightHistory(range);
        if (!session.isCurrent()) return;
        if (cached && cached.entries.length > 0) {
          set({
            entries: toChronological(cached.entries),
            points: cached.points,
            summary: cached.summary,
            goalWeight: cached.summary.targetWeightKg ?? null,
            startWeight: cached.summary.startingWeightKg ?? null,
            isLoading: false,
          });
        }
      }

      // 2. Fetch fresh data from backend
      try {
        const data = await progressApi.getWeightHistory({
          range,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          limit: 100,
        });
        if (!session.isCurrent()) return;

        if (get().currentRange !== range) return;
        if (data) {
          set({
            entries: toChronological(data.entries),
            points: data.points,
            summary: data.summary,
            goalWeight: data.summary.targetWeightKg ?? null,
            startWeight: data.summary.startingWeightKg ?? null,
            isLoading: false,
          });
          await progressOfflineSync.setCachedWeightHistory(range, data);
          if (!session.isCurrent()) return;
        }
      } catch (err: any) {
        if (!session.isCurrent()) return;
        logger.warn(
          'Failed to fetch weight history from server, using cached/local data:',
          err?.message,
        );
        set({ isLoading: false, error: err?.message || 'Failed to load weight history' });
      }
    },

    fetchMeasurements: async (force = false) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      set({ isLoading: true, error: null });

      if (!force) {
        const cached = await progressOfflineSync.getCachedMeasurements();
        if (!session.isCurrent()) return;
        if (cached && cached.history.length > 0) {
          set({
            measurements: cached.history,
            measurementDiffs: cached.diffs,
            isLoading: false,
          });
        }
      }

      try {
        const data = await progressApi.getMeasurements({ limit: 100 });
        if (!session.isCurrent()) return;
        if (data) {
          set({
            measurements: data.history,
            measurementDiffs: data.diffs,
            isLoading: false,
          });
          await progressOfflineSync.setCachedMeasurements(data);
          if (!session.isCurrent()) return;
        }
      } catch (err: any) {
        if (!session.isCurrent()) return;
        logger.warn('Failed to fetch measurements from server:', err?.message);
        set({ isLoading: false, error: err?.message || 'Failed to load measurements' });
      }
    },

    addEntry: async (value: number, note?: string | undefined) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      const entries = get().entries;
      const now = new Date();
      const dateStr = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
        now,
      );
      const timeStr = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      }).format(now);
      const clientWeightId = generateUUID();

      const next: WeightEntry = {
        id: clientWeightId,
        date: dateStr,
        value,
        time: timeStr,
        source: 'manual',
        ...(note ? { note } : {}),
      };

      const updatedEntries = [...entries, next];

      set({ entries: updatedEntries });

      // Sync to backend or enqueue offline
      const payload: LogWeightInput = {
        weightKg: value,
        loggedAt: now.toISOString(),
        source: 'manual',
        clientId: clientWeightId,
        ...(note ? { notes: note } : {}),
      };

      try {
        const response = await progressApi.logWeight(payload);
        session.assertCurrent();
        set({
          entries: get().entries.map((entry) =>
            entry.id === clientWeightId ? { ...entry, id: response.log.id } : entry,
          ),
        });
        refreshFitnessQueries();
        await get().fetchWeightHistory(get().currentRange, true);
        return 'synced';
      } catch (error: any) {
        session.assertCurrent();
        if (
          error?.response?.status &&
          error.response.status < 500 &&
          ![408, 429].includes(error.response.status)
        ) {
          set({ entries: get().entries.filter((entry) => entry.id !== clientWeightId) });
          throw error;
        }
        await progressOfflineSync.queueWeightLog(payload);
        return 'queued';
      }
    },

    undoLast: (previous: WeightEntry | undefined) => {
      const entries = get().entries.slice(0, -1);
      const restored = previous ? [...entries, previous] : entries;
      set({ entries: restored });
    },

    deleteEntry: async (id: string): Promise<boolean> => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      try {
        await progressApi.deleteWeight(id);
        session.assertCurrent();
        set({ entries: get().entries.filter((e) => e.id !== id) });
        refreshFitnessQueries();
        await get().fetchWeightHistory(get().currentRange, true);
        session.assertCurrent();
        return true;
      } catch (err) {
        session.assertCurrent();
        logger.error('Failed to delete weight log:', err);
        return false;
      }
    },

    addMeasurement: async (entry: MeasurementEntry) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      const clientMeasId = entry.id || generateUUID();
      const newEntry: MeasurementEntry = {
        ...entry,
        id: clientMeasId,
      };

      set({ measurements: [newEntry, ...get().measurements] });

      const payload = sanitizeMeasurementInput(
        entry.values,
        clientMeasId,
        new Date().toISOString(),
      );

      try {
        const response = await progressApi.logMeasurement(payload);
        session.assertCurrent();
        set({
          measurements: get().measurements.map((item) =>
            item.id === clientMeasId ? { ...item, id: response.measurement.id } : item,
          ),
          measurementDiffs: response.diffs,
        });
        refreshFitnessQueries();
        await get().fetchMeasurements(true);
        return 'synced';
      } catch (error: any) {
        session.assertCurrent();
        if (
          error?.response?.status &&
          error.response.status < 500 &&
          ![408, 429].includes(error.response.status)
        ) {
          set({ measurements: get().measurements.filter((item) => item.id !== clientMeasId) });
          throw error;
        }
        await progressOfflineSync.queueMeasurementLog(payload);
        return 'queued';
      }
    },

    deleteMeasurement: async (id: string): Promise<boolean> => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      try {
        await progressApi.deleteMeasurement(id);
        session.assertCurrent();
        set({ measurements: get().measurements.filter((m) => m.id !== id) });
        refreshFitnessQueries();
        await get().fetchMeasurements(true);
        session.assertCurrent();
        return true;
      } catch (err) {
        session.assertCurrent();
        logger.error('Failed to delete body measurement:', err);
        return false;
      }
    },

    syncPending: async () => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      set({ isSyncing: true });
      try {
        await progressOfflineSync.syncAllPending();
        if (!session.isCurrent()) return;
        await Promise.all([
          get().fetchWeightHistory(get().currentRange, true),
          get().fetchMeasurements(true),
        ]);
        if (!session.isCurrent()) return;
      } finally {
        set({ isSyncing: false });
      }
    },

    init: () => {
      const session = captureUserSession();
      // Initial fetch from cache and server
      get()
        .fetchWeightHistory()
        .catch(() => {
          if (!session.isCurrent()) return;
        });
      get()
        .fetchMeasurements()
        .catch(() => {
          if (!session.isCurrent()) return;
        });

      // Listen for offline queue sync completion
      const unsubscribe = progressOfflineSync.onSyncComplete(() => {
        logger.info('Offline sync completed, refreshing weight store state.');
        get()
          .fetchWeightHistory(get().currentRange, true)
          .catch(() => {
            if (!session.isCurrent()) return;
          });
        get()
          .fetchMeasurements(true)
          .catch(() => {
            if (!session.isCurrent()) return;
          });
      });

      return unsubscribe;
    },
  };
});

export const useLatestWeight = () => useWeightStore((s) => s.entries[s.entries.length - 1]);

registerUserStore(useWeightStore);
