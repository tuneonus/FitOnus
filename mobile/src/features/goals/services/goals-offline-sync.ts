import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { goalsApi } from '../api/goals-api';
import type { Goal, Habit, SetHabitCompletionInput, LogGoalCheckpointInput } from '../types/goal';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { logger } from '@/utils/logger';

export interface QueuedHabitCompletion {
  id: string; // Client idempotency UUID
  habitId: string;
  payload: SetHabitCompletionInput;
  enqueuedAt: string;
  retryCount: number;
  lastError?: string;
}

export interface QueuedGoalCheckpoint {
  id: string; // Client idempotency UUID
  goalId: string;
  payload: LogGoalCheckpointInput;
  enqueuedAt: string;
  retryCount: number;
  lastError?: string;
}

export interface FailedSyncItem {
  id: string; // Client idempotency UUID
  type: 'habit_completion' | 'goal_checkpoint';
  entityId: string; // habitId or goalId
  payload: SetHabitCompletionInput | LogGoalCheckpointInput;
  enqueuedAt: string;
  failedAt: string;
  statusCode?: number | undefined;
  errorMessage: string;
  retryCount: number;
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

type SyncListener = () => void;

class GoalsOfflineSyncService {
  private isSyncing = false;
  private netInfoUnsubscribe: (() => void) | null = null;
  private syncListeners: Set<SyncListener> = new Set();

  constructor() {
    this.initAutoSync();
  }

  private getGoalsCacheKey(): string {
    const userId = useAuthStore.getState().user?.id;
    return userId ? `@fitonus:goals_cache:${userId}` : '@fitonus:goals_cache';
  }

  private getHabitsCacheKey(): string {
    const userId = useAuthStore.getState().user?.id;
    return userId ? `@fitonus:habits_cache:${userId}` : '@fitonus:habits_cache';
  }

  private getHabitsQueueKey(): string {
    const userId = useAuthStore.getState().user?.id;
    return userId ? `@fitonus:pending_habit_completions:${userId}` : '@fitonus:pending_habit_completions';
  }

  private getCheckpointsQueueKey(): string {
    const userId = useAuthStore.getState().user?.id;
    return userId ? `@fitonus:pending_goal_checkpoints:${userId}` : '@fitonus:pending_goal_checkpoints';
  }

  private getFailedQueueKey(): string {
    const userId = useAuthStore.getState().user?.id;
    return userId ? `@fitonus:failed_goals_sync:${userId}` : '@fitonus:failed_goals_sync';
  }

  private initAutoSync() {
    try {
      this.netInfoUnsubscribe = NetInfo.addEventListener((state) => {
        if (state.isConnected && state.isInternetReachable !== false) {
          this.syncAllPending().catch((err) => {
            logger.warn('Auto offline goals/habits sync failed:', err);
          });
        }
      });
    } catch (err) {
      logger.warn('Failed to initialize NetInfo sync listener for goals:', err);
    }
  }

  public destroy() {
    if (this.netInfoUnsubscribe) {
      this.netInfoUnsubscribe();
      this.netInfoUnsubscribe = null;
    }
    this.syncListeners.clear();
  }

  public addSyncListener(listener: SyncListener): () => void {
    this.syncListeners.add(listener);
    return () => this.syncListeners.delete(listener);
  }

  private notifyListeners() {
    for (const listener of this.syncListeners) {
      try {
        listener();
      } catch (err) {
        logger.error('Error in goals sync listener:', err);
      }
    }
  }

  // --- Offline Caching ---

  public async saveGoalsCache(goals: Goal[]): Promise<void> {
    try {
      await AsyncStorage.setItem(this.getGoalsCacheKey(), JSON.stringify(goals));
    } catch (err) {
      logger.warn('Failed to save goals cache:', err);
    }
  }

  public async loadGoalsCache(): Promise<Goal[] | null> {
    try {
      const data = await AsyncStorage.getItem(this.getGoalsCacheKey());
      return data ? JSON.parse(data) : null;
    } catch (err) {
      logger.warn('Failed to load goals cache:', err);
      return null;
    }
  }

  public async saveHabitsCache(habits: Habit[]): Promise<void> {
    try {
      await AsyncStorage.setItem(this.getHabitsCacheKey(), JSON.stringify(habits));
    } catch (err) {
      logger.warn('Failed to save habits cache:', err);
    }
  }

  public async loadHabitsCache(): Promise<Habit[] | null> {
    try {
      const data = await AsyncStorage.getItem(this.getHabitsCacheKey());
      return data ? JSON.parse(data) : null;
    } catch (err) {
      logger.warn('Failed to load habits cache:', err);
      return null;
    }
  }

  public async clearUserCache(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        this.getGoalsCacheKey(),
        this.getHabitsCacheKey(),
        this.getHabitsQueueKey(),
        this.getCheckpointsQueueKey(),
        this.getFailedQueueKey(),
      ]);
    } catch (err) {
      logger.warn('Failed to clear goals/habits user cache:', err);
    }
  }

  // --- Mutation Queueing ---

  public async queueHabitCompletion(habitId: string, payload: SetHabitCompletionInput): Promise<string> {
    const id = payload.id || generateUUID();
    const item: QueuedHabitCompletion = {
      id,
      habitId,
      payload: { ...payload, id },
      enqueuedAt: new Date().toISOString(),
      retryCount: 0,
    };

    const queue = await this.getHabitsQueue();
    // Overwrite any existing uncommitted mutation for the same habit & date with the latest explicit intent
    const filtered = queue.filter((q) => !(q.habitId === habitId && q.payload.date === payload.date));
    filtered.push(item);
    await AsyncStorage.setItem(this.getHabitsQueueKey(), JSON.stringify(filtered));

    return id;
  }

  public async queueGoalCheckpoint(goalId: string, payload: LogGoalCheckpointInput): Promise<string> {
    const id = generateUUID();
    const item: QueuedGoalCheckpoint = {
      id,
      goalId,
      payload,
      enqueuedAt: new Date().toISOString(),
      retryCount: 0,
    };

    const queue = await this.getCheckpointsQueue();
    queue.push(item);
    await AsyncStorage.setItem(this.getCheckpointsQueueKey(), JSON.stringify(queue));

    return id;
  }

  public async getHabitsQueue(): Promise<QueuedHabitCompletion[]> {
    try {
      const raw = await AsyncStorage.getItem(this.getHabitsQueueKey());
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  public async getCheckpointsQueue(): Promise<QueuedGoalCheckpoint[]> {
    try {
      const raw = await AsyncStorage.getItem(this.getCheckpointsQueueKey());
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  public async getPendingCount(): Promise<number> {
    const [habits, checkpoints] = await Promise.all([this.getHabitsQueue(), this.getCheckpointsQueue()]);
    return habits.length + checkpoints.length;
  }

  // --- Dead-Letter / Failed Sync Queue ---

  public async recordFailedItem(item: FailedSyncItem): Promise<void> {
    try {
      const failed = await this.getFailedSyncItems();
      const updated = failed.filter((f) => f.id !== item.id);
      updated.push(item);
      await AsyncStorage.setItem(this.getFailedQueueKey(), JSON.stringify(updated));
    } catch (err) {
      logger.warn('Failed to persist failed sync item to dead-letter queue:', err);
    }
  }

  public async getFailedSyncItems(): Promise<FailedSyncItem[]> {
    try {
      const raw = await AsyncStorage.getItem(this.getFailedQueueKey());
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  public async getFailedCount(): Promise<number> {
    const items = await this.getFailedSyncItems();
    return items.length;
  }

  public async clearFailedSyncItems(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.getFailedQueueKey());
    } catch (err) {
      logger.warn('Failed to clear failed sync items:', err);
    }
  }

  public async dismissFailedItem(id: string): Promise<void> {
    try {
      const items = await this.getFailedSyncItems();
      const updated = items.filter((f) => f.id !== id);
      await AsyncStorage.setItem(this.getFailedQueueKey(), JSON.stringify(updated));
    } catch (err) {
      logger.warn('Failed to dismiss failed sync item:', err);
    }
  }

  public async retryFailedItem(id: string): Promise<void> {
    try {
      const items = await this.getFailedSyncItems();
      const target = items.find((f) => f.id === id);
      if (!target) return;
      if (target.type === 'habit_completion') {
        await this.queueHabitCompletion(target.entityId, target.payload as SetHabitCompletionInput);
      } else if (target.type === 'goal_checkpoint') {
        await this.queueGoalCheckpoint(target.entityId, target.payload as LogGoalCheckpointInput);
      }
      await this.dismissFailedItem(id);
    } catch (err) {
      logger.warn('Failed to re-queue failed sync item:', err);
    }
  }

  // --- Synchronization Engine ---

  public async syncAllPending(): Promise<{ habitSynced: number; checkpointSynced: number; errors: number; failed: number }> {
    if (this.isSyncing) {
      return { habitSynced: 0, checkpointSynced: 0, errors: 0, failed: 0 };
    }

    const net = await NetInfo.fetch();
    if (!net.isConnected || net.isInternetReachable === false) {
      return { habitSynced: 0, checkpointSynced: 0, errors: 0, failed: 0 };
    }

    this.isSyncing = true;
    let habitSynced = 0;
    let checkpointSynced = 0;
    let errors = 0;
    let failed = 0;

    try {
      // 1. Process Habit Completions Queue
      const habitQueue = await this.getHabitsQueue();
      const remainingHabits: QueuedHabitCompletion[] = [];

      for (const item of habitQueue) {
        try {
          await goalsApi.setHabitCompletion(item.habitId, item.payload);
          habitSynced++;
        } catch (err: any) {
          // If conflict (409), treat as confirmed duplicate success
          if (err?.response?.status === 409) {
            habitSynced++;
          } else if (err?.response?.status >= 400 && err?.response?.status < 500) {
            // Unrecoverable 4xx client errors (e.g. 400 validation error, 404 deleted habit)
            // NEVER silently discard: record into failed sync dead-letter queue for user review and audit
            errors++;
            failed++;
            const status = err?.response?.status;
            const errMsg = err?.response?.data?.error?.message || err?.message || 'Sync rejected by server (4xx)';
            logger.error(`Preserving rejected habit completion queue item ${item.id} (HTTP ${status}):`, errMsg);
            await this.recordFailedItem({
              id: item.id,
              type: 'habit_completion',
              entityId: item.habitId,
              payload: item.payload,
              enqueuedAt: item.enqueuedAt,
              failedAt: new Date().toISOString(),
              statusCode: status,
              errorMessage: errMsg,
              retryCount: item.retryCount,
            });
          } else {
            // Network or 5xx -> retain in queue for retry up to 5 attempts
            errors++;
            item.retryCount++;
            item.lastError = err?.message || 'Sync failed';
            if (item.retryCount < 5) {
              remainingHabits.push(item);
            } else {
              failed++;
              logger.error(`Habit completion ${item.id} exceeded max retries. Moving to failed sync queue.`);
              await this.recordFailedItem({
                id: item.id,
                type: 'habit_completion',
                entityId: item.habitId,
                payload: item.payload,
                enqueuedAt: item.enqueuedAt,
                failedAt: new Date().toISOString(),
                statusCode: err?.response?.status,
                errorMessage: `Max retries exceeded: ${item.lastError}`,
                retryCount: item.retryCount,
              });
            }
          }
        }
      }

      await AsyncStorage.setItem(this.getHabitsQueueKey(), JSON.stringify(remainingHabits));

      // 2. Process Checkpoints Queue
      const checkpointQueue = await this.getCheckpointsQueue();
      const remainingCheckpoints: QueuedGoalCheckpoint[] = [];

      for (const item of checkpointQueue) {
        try {
          await goalsApi.logCheckpoint(item.goalId, item.payload);
          checkpointSynced++;
        } catch (err: any) {
          if (err?.response?.status === 409) {
            checkpointSynced++;
          } else if (err?.response?.status >= 400 && err?.response?.status < 500) {
            // Unrecoverable 4xx client errors
            // NEVER silently discard: record into failed sync dead-letter queue
            errors++;
            failed++;
            const status = err?.response?.status;
            const errMsg = err?.response?.data?.error?.message || err?.message || 'Sync rejected by server (4xx)';
            logger.error(`Preserving rejected checkpoint queue item ${item.id} (HTTP ${status}):`, errMsg);
            await this.recordFailedItem({
              id: item.id,
              type: 'goal_checkpoint',
              entityId: item.goalId,
              payload: item.payload,
              enqueuedAt: item.enqueuedAt,
              failedAt: new Date().toISOString(),
              statusCode: status,
              errorMessage: errMsg,
              retryCount: item.retryCount,
            });
          } else {
            errors++;
            item.retryCount++;
            item.lastError = err?.message || 'Sync failed';
            if (item.retryCount < 5) {
              remainingCheckpoints.push(item);
            } else {
              failed++;
              logger.error(`Checkpoint ${item.id} exceeded max retries. Moving to failed sync queue.`);
              await this.recordFailedItem({
                id: item.id,
                type: 'goal_checkpoint',
                entityId: item.goalId,
                payload: item.payload,
                enqueuedAt: item.enqueuedAt,
                failedAt: new Date().toISOString(),
                statusCode: err?.response?.status,
                errorMessage: `Max retries exceeded: ${item.lastError}`,
                retryCount: item.retryCount,
              });
            }
          }
        }
      }

      await AsyncStorage.setItem(this.getCheckpointsQueueKey(), JSON.stringify(remainingCheckpoints));

      if (habitSynced > 0 || checkpointSynced > 0 || failed > 0) {
        this.notifyListeners();
      }
    } finally {
      this.isSyncing = false;
    }

    return { habitSynced, checkpointSynced, errors, failed };
  }
}

export const goalsOfflineSync = new GoalsOfflineSyncService();
