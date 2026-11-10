import { captureUserSession } from '@/services/user-session';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { workoutApi } from '../api/workout-api';
import type { SaveWorkoutSessionInput, WorkoutSessionResponse } from '../types/workout';
import { logger } from '@/utils/logger';

let cachedNetInfo: any = undefined;
function getNetInfo(): any {
  if (cachedNetInfo !== undefined) return cachedNetInfo;
  try {
    const mod = require('@react-native-community/netinfo');
    cachedNetInfo = mod.default ?? mod;
  } catch {
    cachedNetInfo = null;
  }
  return cachedNetInfo;
}

function workoutQueueKey() {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) throw new Error('Sign in before saving or syncing workouts.');
  return `@fitonus:pending_workout_sessions:${userId}`;
}

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
      const netInfo = getNetInfo();
      if (!netInfo) return;
      this.netInfoUnsubscribe = netInfo.addEventListener((state: any) => {
        if (state.isConnected && state.isInternetReachable !== false) {
          this.syncPendingSessions().catch((err: any) => {
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
    const session = captureUserSession();
    try {
      const queue = await this.getPendingSessions();
      session.assertCurrent();
      // Prevent duplicate queue entries for the same clientSessionId
      const existingIdx = queue.findIndex(
        (item) => item.clientSessionId === payload.clientSessionId,
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

      await AsyncStorage.setItem(workoutQueueKey(), JSON.stringify(queue));
      session.assertCurrent();
      logger.info(
        `Workout session enqueued offline. Queue length: ${queue.length}`,
        payload.clientSessionId,
      );
    } catch (error) {
      session.assertCurrent();
      logger.error('Failed to enqueue workout session offline:', error);
      throw error;
    }
  }

  /**
   * Retrieve all pending workout sessions currently in local storage.
   */
  async getPendingSessions(): Promise<QueuedWorkoutSession[]> {
    const session = captureUserSession();
    try {
      const raw = await AsyncStorage.getItem(workoutQueueKey());
      session.assertCurrent();
      if (!raw) return [];
      return JSON.parse(raw) as QueuedWorkoutSession[];
    } catch (error) {
      session.assertCurrent();
      logger.error('Failed to read offline workout sessions queue:', error);
      return [];
    }
  }

  /**
   * Returns the count of pending sessions waiting for sync.
   */
  async getPendingCount(): Promise<number> {
    const session = captureUserSession();
    const queue = await this.getPendingSessions();
    session.assertCurrent();
    return queue.length;
  }

  /**
   * Checks whether a specific session ID has a pending sync in storage.
   */
  async hasPendingSync(clientSessionId: string): Promise<boolean> {
    const session = captureUserSession();
    const queue = await this.getPendingSessions();
    session.assertCurrent();
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
    if (!useAuthStore.getState().isAuthenticated) return { synced: 0, failed: 0, results: [] };
    const session = captureUserSession();
    if (!session.userId || this.isSyncing) return { synced: 0, failed: 0, results: [] };
    this.isSyncing = true;
    const results: WorkoutSessionResponse[] = [];
    let failed = 0;
    try {
      const netInfo = getNetInfo();
      const netState = netInfo ? await netInfo.fetch() : { isConnected: true };
      session.assertCurrent();
      if (!netState.isConnected) return { synced: 0, failed: 0, results };
      const queue = await this.getPendingSessions();
      session.assertCurrent();
      for (const item of queue) {
        session.assertCurrent();
        try {
          const response = await workoutApi.saveWorkoutSession(item.payload, item.clientSessionId);
          session.assertCurrent();
          results.push(response);
          // Read again so sessions logged during synchronization are preserved.
          const latest = await this.getPendingSessions();
          session.assertCurrent();
          await AsyncStorage.setItem(
            workoutQueueKey(),
            JSON.stringify(
              latest.filter((entry) => entry.clientSessionId !== item.clientSessionId),
            ),
          );
        } catch (error: any) {
          session.assertCurrent();
          failed++;
          const latest = await this.getPendingSessions();
          session.assertCurrent();
          await AsyncStorage.setItem(
            workoutQueueKey(),
            JSON.stringify(
              latest.map((entry) =>
                entry.clientSessionId === item.clientSessionId
                  ? {
                      ...entry,
                      retryCount: entry.retryCount + 1,
                      lastError: error?.message || 'Sync failed',
                    }
                  : entry,
              ),
            ),
          );
        }
      }
      session.assertCurrent();
      return { synced: results.length, failed, results };
    } finally {
      this.isSyncing = false;
    }
  }
}

export const offlineSyncService = new OfflineSyncService();
