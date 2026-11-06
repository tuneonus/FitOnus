import { create } from 'zustand';
import type { MeasurementEntry, WeightEntry } from '../types/weight';
import type {
  ChartPoint,
  TimeRange,
} from '@/shared/types/health';
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
import { logger } from '@/utils/logger';

export interface WeightState {
  entries: WeightEntry[];
  measurements: MeasurementEntry[];
  goalWeight: number;
  startWeight: number;
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
  addEntry: (value: number, note?: string | undefined) => WeightEntry | undefined;
  undoLast: (previous: WeightEntry | undefined) => void;
  deleteEntry: (id: string) => Promise<boolean>;
  addMeasurement: (entry: MeasurementEntry) => void;
  deleteMeasurement: (id: string) => Promise<boolean>;
  syncPending: () => Promise<void>;
  resetStore: () => void;
  init: () => () => void;
}

const defaultGoalWeight = 75;
const defaultStartWeight = 84.2;

export const useWeightStore = create<WeightState>((set, get) => ({
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
    set({ isLoading: true, error: null, currentRange: range });

    // 1. Load from cache first for instant rendering
    if (!force) {
      const cached = await progressOfflineSync.getCachedWeightHistory(range);
      if (cached && cached.entries.length > 0) {
        set({
          entries: cached.entries,
          points: cached.points,
          summary: cached.summary,
          goalWeight: cached.summary.targetWeightKg ?? get().goalWeight,
          startWeight: cached.summary.startingWeightKg ?? get().startWeight,
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

      if (data) {
        set({
          entries: data.entries,
          points: data.points,
          summary: data.summary,
          goalWeight: data.summary.targetWeightKg ?? get().goalWeight,
          startWeight: data.summary.startingWeightKg ?? get().startWeight,
          isLoading: false,
        });
        await progressOfflineSync.setCachedWeightHistory(range, data);
      }
    } catch (err: any) {
      logger.warn('Failed to fetch weight history from server, using cached/local data:', err?.message);
      set({ isLoading: false, error: err?.message || 'Failed to load weight history' });
    }
  },

  fetchMeasurements: async (force = false) => {
    set({ isLoading: true, error: null });

    if (!force) {
      const cached = await progressOfflineSync.getCachedMeasurements();
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
      if (data) {
        set({
          measurements: data.history,
          measurementDiffs: data.diffs,
          isLoading: false,
        });
        await progressOfflineSync.setCachedMeasurements(data);
      }
    } catch (err: any) {
      logger.warn('Failed to fetch measurements from server:', err?.message);
      set({ isLoading: false, error: err?.message || 'Failed to load measurements' });
    }
  },

  addEntry: (value: number, note?: string | undefined) => {
    const entries = get().entries;
    const now = new Date();
    const dateStr = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(now);
    const timeStr = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(now);
    const clientWeightId = generateUUID();

    const last = entries[entries.length - 1];
    const replacing = last?.date === dateStr;

    const next: WeightEntry = {
      id: clientWeightId,
      date: dateStr,
      value,
      time: timeStr,
      source: 'manual',
      ...(note ? { note } : {}),
    };

    const updatedEntries = replacing
      ? [...entries.slice(0, -1), next]
      : [...entries, next];

    set({ entries: updatedEntries });

    // Sync to backend or enqueue offline
    const payload: LogWeightInput = {
      weightKg: value,
      loggedAt: now.toISOString(),
      source: 'manual',
      clientId: clientWeightId,
      ...(note ? { notes: note } : {}),
    };

    progressApi
      .logWeight(payload)
      .then((res) => {
        if (res && res.log) {
          // Replace temporary client ID with server ID
          set({
            entries: get().entries.map((e) =>
              e.id === clientWeightId ? { ...e, id: res.log.id } : e,
            ),
          });
          // Refresh in background
          get().fetchWeightHistory(get().currentRange, true).catch(() => {});
        }
      })
      .catch(async (err) => {
        logger.warn('Weight log failed, enqueuing for offline sync:', err?.message);
        await progressOfflineSync.queueWeightLog(payload);
      });

    return replacing ? last : undefined;
  },

  undoLast: (previous: WeightEntry | undefined) => {
    const entries = get().entries.slice(0, -1);
    const restored = previous ? [...entries, previous] : entries;
    set({ entries: restored });
  },

  deleteEntry: async (id: string): Promise<boolean> => {
    try {
      await progressApi.deleteWeight(id);
      set({ entries: get().entries.filter((e) => e.id !== id) });
      await get().fetchWeightHistory(get().currentRange, true);
      return true;
    } catch (err) {
      logger.error('Failed to delete weight log:', err);
      return false;
    }
  },

  addMeasurement: (entry: MeasurementEntry) => {
    const clientMeasId = entry.id || generateUUID();
    const newEntry: MeasurementEntry = {
      ...entry,
      id: clientMeasId,
    };

    set({ measurements: [newEntry, ...get().measurements] });

    const payload = sanitizeMeasurementInput(entry.values, clientMeasId, new Date().toISOString());

    progressApi
      .logMeasurement(payload)
      .then((res) => {
        if (res && res.measurement) {
          set({
            measurements: get().measurements.map((m) =>
              m.id === clientMeasId ? { ...m, id: res.measurement.id } : m,
            ),
            measurementDiffs: res.diffs,
          });
          get().fetchMeasurements(true).catch(() => {});
        }
      })
      .catch(async (err) => {
        logger.warn('Measurement log failed, enqueuing for offline sync:', err?.message);
        await progressOfflineSync.queueMeasurementLog(payload);
      });
  },

  deleteMeasurement: async (id: string): Promise<boolean> => {
    try {
      await progressApi.deleteMeasurement(id);
      set({ measurements: get().measurements.filter((m) => m.id !== id) });
      await get().fetchMeasurements(true);
      return true;
    } catch (err) {
      logger.error('Failed to delete body measurement:', err);
      return false;
    }
  },

  syncPending: async () => {
    set({ isSyncing: true });
    try {
      await progressOfflineSync.syncAllPending();
      await Promise.all([
        get().fetchWeightHistory(get().currentRange, true),
        get().fetchMeasurements(true),
      ]);
    } finally {
      set({ isSyncing: false });
    }
  },

  init: () => {
    // Initial fetch from cache and server
    get().fetchWeightHistory().catch(() => {});
    get().fetchMeasurements().catch(() => {});

    // Listen for offline queue sync completion
    const unsubscribe = progressOfflineSync.onSyncComplete(() => {
      logger.info('Offline sync completed, refreshing weight store state.');
      get().fetchWeightHistory(get().currentRange, true).catch(() => {});
      get().fetchMeasurements(true).catch(() => {});
    });

    return unsubscribe;
  },
}));

export const useLatestWeight = () =>
  useWeightStore((s) => s.entries[s.entries.length - 1]);
