import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { workoutApi } from '../api/workout-api';
import type { SaveWorkoutSessionInput, WorkoutSessionResponse } from '../types/workout';
import { logger } from '@/utils/logger';

const OFFLINE_QUEUE_KEY = '@fitonus:pending_workout_sessions';

export interface QueuedWorkoutSession {
  clientSessionId: string;
  payload: SaveWorkoutSessionInput;
  enqueuedAt: string;
  retryCount: number;
  lastError?: string;
}

class OfflineSyncService {
  private isSyncing = false;
  private netInfoUnsubscribe: (() => void) | null = null;

  constructor() {
    this.initAutoSync();
  }

  private initAutoSync() {
    try {
      this.netInfoUnsubscribe = NetInfo.addEventListener((state) => {
        if (state.isConnected && state.isInternetReachable !== false) {
          this.syncPendingSessions().catch((err) => {
            logger.warn('Auto offline workout sync failed:', err);
          });
        }
      });
    } catch (err) {
      logger.warn('Failed to initialize NetInfo sync listener:', err);
    }
  }

  public destroy() {
    if (this.netInfoUnsubscribe) {
      this.netInfoUnsubscribe();
      this.netInfoUnsubscribe = null;
    }
  }

  /**
   * Enqueue a workout session locally for offline synchronization.
   */
  async enqueueSession(payload: SaveWorkoutSessionInput): Promise<void> {
    try {
      const queue = await this.getPendingSessions();
      // Prevent duplicate queue entries for the same clientSessionId
      const existingIdx = queue.findIndex(
        (item) => item.clientSessionId === payload.clientSessionId
      );

      const newItem: QueuedWorkoutSession = {
        clientSessionId: payload.clientSessionId,
        payload,
        enqueuedAt: new Date().toISOString(),
        retryCount: 0,
      };

      if (existingIdx >= 0) {
        queue[existingIdx] = newItem;
      } else {
        queue.push(newItem);
      }

      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
      logger.info(
        `Workout session enqueued offline. Queue length: ${queue.length}`,
        payload.clientSessionId
      );
    } catch (error) {
      logger.error('Failed to enqueue workout session offline:', error);
      throw error;
    }
  }

  /**
   * Retrieve all pending workout sessions currently in local storage.
   */
  async getPendingSessions(): Promise<QueuedWorkoutSession[]> {
    try {
      const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as QueuedWorkoutSession[];
    } catch (error) {
      logger.error('Failed to read offline workout sessions queue:', error);
      return [];
    }
  }

  /**
   * Returns the count of pending sessions waiting for sync.
   */
  async getPendingCount(): Promise<number> {
    const queue = await this.getPendingSessions();
    return queue.length;
  }

  /**
   * Checks whether a specific session ID has a pending sync in storage.
   */
  async hasPendingSync(clientSessionId: string): Promise<boolean> {
    const queue = await this.getPendingSessions();
    return queue.some((item) => item.clientSessionId === clientSessionId);
  }

  /**
   * Synchronizes all pending queued sessions with the backend.
   * If online and server responds, removes the item from the queue.
   */
  async syncPendingSessions(): Promise<{
    synced: number;
    failed: number;
    results: WorkoutSessionResponse[];
  }> {
    if (this.isSyncing) {
      logger.info('Offline workout sync already in progress. Skipping.');
      return { synced: 0, failed: 0, results: [] };
    }

    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      logger.info('Device is offline. Deferring workout sync.');
      return { synced: 0, failed: 0, results: [] };
    }

    this.isSyncing = true;
    const queue = await this.getPendingSessions();
    if (queue.length === 0) {
      this.isSyncing = false;
      return { synced: 0, failed: 0, results: [] };
    }

    logger.info(`Starting synchronization of ${queue.length} pending workout sessions...`);

    const remainingQueue: QueuedWorkoutSession[] = [];
    const results: WorkoutSessionResponse[] = [];
    let synced = 0;
    let failed = 0;

    for (const item of queue) {
      try {
        const response = await workoutApi.saveWorkoutSession(
          item.payload,
          item.clientSessionId
        );
        results.push(response);
        synced++;
        logger.info(`Successfully synced session: ${item.clientSessionId}`);
      } catch (err: any) {
        // If HTTP 4xx (client error / bad request), do not retry indefinitely
        const status = err?.response?.status;
        if (status && status >= 400 && status < 500 && status !== 408) {
          logger.error(
            `Session ${item.clientSessionId} failed with client error ${status}. Removing from queue.`,
            err?.response?.data
          );
          failed++;
        } else {
          // Network / 5xx error: Keep in queue with incremented retry count
          item.retryCount += 1;
          item.lastError = err?.message || 'Network error';
          remainingQueue.push(item);
          failed++;
          logger.warn(
            `Sync failed for session ${item.clientSessionId} (attempt ${item.retryCount}): ${err?.message}`
          );
        }
      }
    }

    try {
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remainingQueue));
    } catch (saveErr) {
      logger.error('Failed to update offline queue after sync:', saveErr);
    } finally {
      this.isSyncing = false;
    }

    return { synced, failed, results };
  }
}

export const offlineSyncService = new OfflineSyncService();
