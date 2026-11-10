import { captureUserSession } from '@/services/user-session';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { nutritionApi } from '../api/nutrition-api';
import type { LogMealInput, LogWaterInput } from '../types/nutrition';
import { generateUUID } from '../utils/uuid';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { logger } from '@/utils/logger';

export interface QueuedMealLog {
  clientMealId: string;
  payload: LogMealInput;
  enqueuedAt: string;
  retryCount: number;
  lastError?: string;
}

export interface QueuedWaterLog {
  clientWaterId: string;
  payload: LogWaterInput;
  enqueuedAt: string;
  retryCount: number;
  lastError?: string;
}

type SyncListener = () => void;

class NutritionOfflineSyncService {
  private isSyncing = false;
  private netInfoUnsubscribe: (() => void) | null = null;
  private syncListeners: Set<SyncListener> = new Set();

  constructor() {
    this.initAutoSync();
  }

  private getMealsKey(): string {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) throw new Error('Sign in to access your saved fitness data.');
    return userId ? `@fitonus:pending_meals:${userId}` : '@fitonus:pending_meals';
  }

  private getWaterKey(): string {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) throw new Error('Sign in to access your saved fitness data.');
    return userId ? `@fitonus:pending_water:${userId}` : '@fitonus:pending_water';
  }

  private initAutoSync() {
    try {
      this.netInfoUnsubscribe = NetInfo.addEventListener((state) => {
        if (state.isConnected && state.isInternetReachable !== false) {
          this.syncAllPending().catch((err) => {
            logger.warn('Auto offline nutrition sync failed:', err);
          });
        }
      });
    } catch (err) {
      logger.warn('Failed to initialize NetInfo sync listener for nutrition:', err);
    }
  }

  public destroy() {
    if (this.netInfoUnsubscribe) {
      this.netInfoUnsubscribe();
      this.netInfoUnsubscribe = null;
    }
    this.syncListeners.clear();
  }

  public onSyncComplete(listener: SyncListener): () => void {
    this.syncListeners.add(listener);
    return () => this.syncListeners.delete(listener);
  }

  private notifySyncComplete() {
    this.syncListeners.forEach((listener) => {
      try {
        listener();
      } catch (e) {
        logger.error('Error in nutrition sync listener:', e);
      }
    });
  }

  // --- Meals Queue ---

  async enqueueMeal(payload: LogMealInput): Promise<void> {
    const session = captureUserSession();
    try {
      const queue = await this.getPendingMeals();
      session.assertCurrent();
      const clientMealId = payload.id || generateUUID();
      const payloadWithId = { ...payload, id: clientMealId };

      const existingIdx = queue.findIndex((m) => m.clientMealId === clientMealId);
      const item: QueuedMealLog = {
        clientMealId,
        payload: payloadWithId,
        enqueuedAt: new Date().toISOString(),
        retryCount: 0,
      };

      if (existingIdx >= 0) {
        queue[existingIdx] = item;
      } else {
        queue.push(item);
      }

      await AsyncStorage.setItem(this.getMealsKey(), JSON.stringify(queue));
      session.assertCurrent();
      logger.info(`Meal enqueued offline. Pending meals count: ${queue.length}`, clientMealId);
    } catch (error) {
      session.assertCurrent();
      logger.error('Failed to enqueue meal offline:', error);
      throw error;
    }
  }

  async getPendingMeals(): Promise<QueuedMealLog[]> {
    const session = captureUserSession();
    try {
      const raw = await AsyncStorage.getItem(this.getMealsKey());
      session.assertCurrent();
      if (!raw) return [];
      return JSON.parse(raw) as QueuedMealLog[];
    } catch (error) {
      session.assertCurrent();
      logger.error('Failed to read offline meals queue:', error);
      return [];
    }
  }

  // --- Water Queue ---

  async enqueueWater(payload: LogWaterInput): Promise<void> {
    const session = captureUserSession();
    try {
      const queue = await this.getPendingWater();
      session.assertCurrent();
      const clientWaterId = payload.id || generateUUID();
      const payloadWithId = { ...payload, id: clientWaterId };

      const existingIdx = queue.findIndex((w) => w.clientWaterId === clientWaterId);
      const item: QueuedWaterLog = {
        clientWaterId,
        payload: payloadWithId,
        enqueuedAt: new Date().toISOString(),
        retryCount: 0,
      };

      if (existingIdx >= 0) {
        queue[existingIdx] = item;
      } else {
        queue.push(item);
      }

      await AsyncStorage.setItem(this.getWaterKey(), JSON.stringify(queue));
      session.assertCurrent();
      logger.info(`Water enqueued offline. Pending water count: ${queue.length}`, clientWaterId);
    } catch (error) {
      session.assertCurrent();
      logger.error('Failed to enqueue water offline:', error);
      throw error;
    }
  }

  async getPendingWater(): Promise<QueuedWaterLog[]> {
    const session = captureUserSession();
    try {
      const raw = await AsyncStorage.getItem(this.getWaterKey());
      session.assertCurrent();
      if (!raw) return [];
      return JSON.parse(raw) as QueuedWaterLog[];
    } catch (error) {
      session.assertCurrent();
      logger.error('Failed to read offline water queue:', error);
      return [];
    }
  }

  /**
   * Clears pending queues on user logout.
   */
  async clearAllQueues(): Promise<void> {
    const session = captureUserSession();
    try {
      await Promise.all([
        AsyncStorage.removeItem(this.getMealsKey()),
        AsyncStorage.removeItem(this.getWaterKey()),
      ]);
      session.assertCurrent();
    } catch (error) {
      session.assertCurrent();
      logger.error('Failed to clear offline nutrition queues:', error);
    }
  }

  /**
   * Total pending offline mutations count (meals + water).
   */
  async getPendingCount(): Promise<number> {
    const session = captureUserSession();
    const [meals, water] = await Promise.all([this.getPendingMeals(), this.getPendingWater()]);
    session.assertCurrent();
    return meals.length + water.length;
  }

  /**
   * Attempt to sync all pending meals and water mutations to the backend.
   * HTTP 409 is treated as success ONLY for confirmed duplicate submissions.
   */
  async syncAllPending(): Promise<{ syncedMeals: number; syncedWater: number; remaining: number }> {
    if (!useAuthStore.getState().isAuthenticated)
      return { syncedMeals: 0, syncedWater: 0, remaining: 0 };
    const session = captureUserSession();
    if (this.isSyncing) {
      logger.info('Nutrition sync already in progress, skipping concurrent run.');
      const count = await this.getPendingCount();
      session.assertCurrent();
      return { syncedMeals: 0, syncedWater: 0, remaining: count };
    }

    this.isSyncing = true;
    let syncedMeals = 0;
    let syncedWater = 0;

    try {
      // 1. Sync Meals
      const mealsQueue = await this.getPendingMeals();
      session.assertCurrent();
      const mealsQueueIds = new Set(mealsQueue.map((item) => item.clientMealId));
      const remainingMeals: QueuedMealLog[] = [];

      for (const item of mealsQueue) {
        try {
          await nutritionApi.logMeal(item.payload);
          session.assertCurrent();
          syncedMeals++;
          logger.info(`Successfully synced offline meal: ${item.clientMealId}`);
        } catch (err: any) {
          session.assertCurrent();
          const status = err?.response?.status;
          const errMsg = err?.response?.data?.error?.message || '';

          // HTTP 409 Conflict: Verify whether this is a confirmed duplicate or an ID collision with another user
          if (status === 409) {
            let isConfirmed = false;
            try {
              const existing = await nutritionApi.getMeal(item.clientMealId);
              session.assertCurrent();
              if (existing && existing.id === item.clientMealId) {
                isConfirmed = true;
              }
            } catch (checkErr: any) {
              session.assertCurrent();
              logger.warn(
                `Meal ${item.clientMealId} returned 409 Conflict but could not be verified: ${checkErr?.message}`,
              );
            }

            if (isConfirmed) {
              logger.info(
                `Meal ${item.clientMealId} confirmed already on server (409 Duplicate). Removing from queue.`,
              );
              syncedMeals++;
              continue;
            } else {
              // ID collision with another user: regenerate RFC 4122 v4 UUID and retain to prevent data loss!
              const newId = generateUUID();
              logger.info(
                `Regenerating meal UUID ${item.clientMealId} -> ${newId} to resolve ID collision.`,
              );
              item.clientMealId = newId;
              item.payload.id = newId;
              remainingMeals.push(item);
              continue;
            }
          }

          // Permanent 4xx client errors (excluding 408/429) discard to avoid stuck queue
          if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
            logger.warn(
              `Meal ${item.clientMealId} failed with unrecoverable client error ${status} (${errMsg}). Removing from queue.`,
            );
            continue;
          }

          // Transient network or server error - retain for next attempt
          remainingMeals.push({
            ...item,
            retryCount: item.retryCount + 1,
            lastError: err?.message || 'Network/server error',
          });
        }
      }

      const mealsQueueLatest = await this.getPendingMeals();
      session.assertCurrent();
      await AsyncStorage.setItem(
        this.getMealsKey(),
        JSON.stringify([
          ...mealsQueueLatest.filter((item) => !mealsQueueIds.has(item.clientMealId)),
          ...remainingMeals,
        ]),
      );
      session.assertCurrent();

      // 2. Sync Water
      const waterQueue = await this.getPendingWater();
      session.assertCurrent();
      const waterQueueIds = new Set(waterQueue.map((item) => item.clientWaterId));
      const remainingWater: QueuedWaterLog[] = [];

      for (const item of waterQueue) {
        try {
          await nutritionApi.logWater(item.payload);
          session.assertCurrent();
          syncedWater++;
          logger.info(`Successfully synced offline water: ${item.clientWaterId}`);
        } catch (err: any) {
          session.assertCurrent();
          const status = err?.response?.status;
          const errMsg = err?.response?.data?.error?.message || '';

          if (status === 409) {
            if (errMsg.includes('collision') || errMsg.includes('another user')) {
              const newWaterId = generateUUID();
              logger.info(
                `Regenerating water UUID ${item.clientWaterId} -> ${newWaterId} to resolve ID collision.`,
              );
              item.clientWaterId = newWaterId;
              item.payload.id = newWaterId;
              remainingWater.push(item);
              continue;
            }

            logger.info(`Water entry ${item.clientWaterId} confirmed duplicate (409). Removing.`);
            syncedWater++;
            continue;
          }

          if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
            logger.warn(`Water ${item.clientWaterId} failed with ${status}. Removing.`);
            continue;
          }

          remainingWater.push({
            ...item,
            retryCount: item.retryCount + 1,
            lastError: err?.message || 'Network/server error',
          });
        }
      }

      const waterQueueLatest = await this.getPendingWater();
      session.assertCurrent();
      await AsyncStorage.setItem(
        this.getWaterKey(),
        JSON.stringify([
          ...waterQueueLatest.filter((item) => !waterQueueIds.has(item.clientWaterId)),
          ...remainingWater,
        ]),
      );
      session.assertCurrent();

      if (syncedMeals > 0 || syncedWater > 0) {
        this.notifySyncComplete();
      }

      const remaining = remainingMeals.length + remainingWater.length;
      return { syncedMeals, syncedWater, remaining };
    } finally {
      this.isSyncing = false;
    }
  }
}

export const nutritionOfflineSync = new NutritionOfflineSyncService();
