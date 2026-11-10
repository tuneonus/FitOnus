import { captureUserSession } from '@/services/user-session';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { progressApi } from '../api/progress-api';
import type {
  LogMeasurementInput,
  LogWeightInput,
  MeasurementHistoryResponse,
  WeightHistoryResponse,
} from '../types/progress';
import { generateUUID } from '@/features/nutrition/utils/uuid';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { logger } from '@/utils/logger';

export interface QueuedWeightLog {
  clientWeightId: string;
  payload: LogWeightInput;
  enqueuedAt: string;
  retryCount: number;
  lastError?: string | undefined;
}

export interface QueuedMeasurementLog {
  clientMeasId: string;
  payload: LogMeasurementInput;
  enqueuedAt: string;
  retryCount: number;
  lastError?: string | undefined;
}

type SyncListener = () => void;

class ProgressOfflineSyncService {
  private isSyncing = false;
  private netInfoUnsubscribe: (() => void) | null = null;
  private syncListeners: Set<SyncListener> = new Set();

  constructor() {
    this.initAutoSync();
  }

  private getWeightQueueKey(): string {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) throw new Error('Sign in to access your saved fitness data.');
    return userId ? `@fitonus:pending_weight:${userId}` : '@fitonus:pending_weight';
  }

  private getMeasurementQueueKey(): string {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) throw new Error('Sign in to access your saved fitness data.');
    return userId ? `@fitonus:pending_measurements:${userId}` : '@fitonus:pending_measurements';
  }

  private getWeightCacheKey(range: string): string {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) throw new Error('Sign in to access your saved fitness data.');
    return userId ? `@fitonus:cached_weight_${range}:${userId}` : `@fitonus:cached_weight_${range}`;
  }

  private getMeasurementCacheKey(): string {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) throw new Error('Sign in to access your saved fitness data.');
    return userId ? `@fitonus:cached_measurements:${userId}` : '@fitonus:cached_measurements';
  }

  private initAutoSync() {
    try {
      this.netInfoUnsubscribe = NetInfo.addEventListener((state) => {
        if (state.isConnected && state.isInternetReachable !== false) {
          this.syncAllPending().catch((err) => {
            logger.warn('Auto offline progress sync failed:', err);
          });
        }
      });
    } catch (err) {
      logger.warn('Failed to initialize NetInfo sync listener for progress:', err);
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
        logger.error('Error in progress sync listener:', e);
      }
    });
  }

  // --- Weight Queue Management ---

  public async getPendingWeights(): Promise<QueuedWeightLog[]> {
    const session = captureUserSession();
    try {
      const raw = await AsyncStorage.getItem(this.getWeightQueueKey());
      session.assertCurrent();
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      session.assertCurrent();
      logger.error('Failed to read pending weights queue:', err);
      return [];
    }
  }

  public async queueWeightLog(payload: LogWeightInput): Promise<{ clientWeightId: string }> {
    const session = captureUserSession();
    const clientWeightId = payload.clientId || generateUUID();
    const queuedItem: QueuedWeightLog = {
      clientWeightId,
      payload: {
        ...payload,
        clientId: clientWeightId,
        loggedAt: payload.loggedAt || new Date().toISOString(),
      },
      enqueuedAt: new Date().toISOString(),
      retryCount: 0,
    };

    const currentQueue = await this.getPendingWeights();
    session.assertCurrent();
    currentQueue.push(queuedItem);
    await AsyncStorage.setItem(this.getWeightQueueKey(), JSON.stringify(currentQueue));
    session.assertCurrent();
    logger.info(`Enqueued offline weight log: ${clientWeightId}`);

    return { clientWeightId };
  }

  // --- Measurement Queue Management ---

  public async getPendingMeasurements(): Promise<QueuedMeasurementLog[]> {
    const session = captureUserSession();
    try {
      const raw = await AsyncStorage.getItem(this.getMeasurementQueueKey());
      session.assertCurrent();
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      session.assertCurrent();
      logger.error('Failed to read pending measurements queue:', err);
      return [];
    }
  }

  public async queueMeasurementLog(
    payload: LogMeasurementInput,
  ): Promise<{ clientMeasId: string }> {
    const session = captureUserSession();
    const clientMeasId = payload.clientId || generateUUID();
    const queuedItem: QueuedMeasurementLog = {
      clientMeasId,
      payload: {
        ...payload,
        clientId: clientMeasId,
        loggedAt: payload.loggedAt || new Date().toISOString(),
      },
      enqueuedAt: new Date().toISOString(),
      retryCount: 0,
    };

    const currentQueue = await this.getPendingMeasurements();
    session.assertCurrent();
    currentQueue.push(queuedItem);
    await AsyncStorage.setItem(this.getMeasurementQueueKey(), JSON.stringify(currentQueue));
    session.assertCurrent();
    logger.info(`Enqueued offline measurement log: ${clientMeasId}`);

    return { clientMeasId };
  }

  // --- Synchronization Execution ---

  public async syncAllPending(): Promise<{
    syncedWeights: number;
    syncedMeasurements: number;
    errors: number;
  }> {
    if (!useAuthStore.getState().isAuthenticated)
      return { syncedWeights: 0, syncedMeasurements: 0, errors: 0 };
    const session = captureUserSession();
    if (this.isSyncing) {
      logger.info('Progress sync already in progress, skipping concurrent run.');
      return { syncedWeights: 0, syncedMeasurements: 0, errors: 0 };
    }

    this.isSyncing = true;
    let syncedWeights = 0;
    let syncedMeasurements = 0;
    let errors = 0;

    try {
      // 1. Sync Weight Logs
      const weightQueue = await this.getPendingWeights();
      session.assertCurrent();
      const weightQueueIds = new Set(weightQueue.map((item) => item.clientWeightId));
      const remainingWeights: QueuedWeightLog[] = [];

      for (const item of weightQueue) {
        try {
          const res = await progressApi.logWeight(item.payload);
          session.assertCurrent();
          syncedWeights++;
          logger.info(`Synced queued weight log: ${item.clientWeightId} (isNew: ${res?.isNew})`);
        } catch (err: any) {
          session.assertCurrent();
          const status = err?.response?.status;
          const errMsg = err?.response?.data?.error?.message || err?.message || '';

          // HTTP 409 Conflict: Handle idempotency deduplication vs ID collision
          if (status === 409 || err?.response?.data?.data?.isNew === false) {
            // Check if server recognized the duplicate as this user's existing log
            const serverLog = err?.response?.data?.data?.log;
            if (
              serverLog ||
              errMsg.toLowerCase().includes('duplicate') ||
              errMsg.toLowerCase().includes('already exists')
            ) {
              syncedWeights++;
              logger.info(
                `Offline weight confirmed duplicate (409) for ${item.clientWeightId}. Removing from queue.`,
              );
              continue;
            } else {
              // Rare ID collision: regenerate RFC 4122 v4 UUID and retry to prevent data loss
              const newId = generateUUID();
              logger.info(
                `Regenerating weight clientId ${item.clientWeightId} -> ${newId} to resolve collision.`,
              );
              item.clientWeightId = newId;
              item.payload.clientId = newId;
              remainingWeights.push(item);
              continue;
            }
          }

          // Unrecoverable 4xx client errors (except 408/429) - discard to avoid blocking queue
          if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
            logger.warn(
              `Weight log ${item.clientWeightId} failed with unrecoverable client error ${status} (${errMsg}). Discarding.`,
            );
            continue;
          }

          // Transient network / 5xx error: increment retry count
          errors++;
          item.retryCount = (item.retryCount || 0) + 1;
          item.lastError = errMsg || 'Network error';
          remainingWeights.push(item);
        }
      }

      const weightQueueLatest = await this.getPendingWeights();
      session.assertCurrent();
      await AsyncStorage.setItem(
        this.getWeightQueueKey(),
        JSON.stringify([
          ...weightQueueLatest.filter((item) => !weightQueueIds.has(item.clientWeightId)),
          ...remainingWeights,
        ]),
      );
      session.assertCurrent();

      // 2. Sync Measurement Logs
      const measQueue = await this.getPendingMeasurements();
      session.assertCurrent();
      const measQueueIds = new Set(measQueue.map((item) => item.clientMeasId));
      const remainingMeas: QueuedMeasurementLog[] = [];

      for (const item of measQueue) {
        try {
          const res = await progressApi.logMeasurement(item.payload);
          session.assertCurrent();
          syncedMeasurements++;
          logger.info(`Synced queued measurement log: ${item.clientMeasId} (isNew: ${res?.isNew})`);
        } catch (err: any) {
          session.assertCurrent();
          const status = err?.response?.status;
          const errMsg = err?.response?.data?.error?.message || err?.message || '';

          if (status === 409 || err?.response?.data?.data?.isNew === false) {
            const serverMeas = err?.response?.data?.data?.measurement;
            if (
              serverMeas ||
              errMsg.toLowerCase().includes('duplicate') ||
              errMsg.toLowerCase().includes('already exists')
            ) {
              syncedMeasurements++;
              logger.info(
                `Offline measurement confirmed duplicate (409) for ${item.clientMeasId}. Removing from queue.`,
              );
              continue;
            } else {
              const newId = generateUUID();
              logger.info(
                `Regenerating measurement clientId ${item.clientMeasId} -> ${newId} to resolve collision.`,
              );
              item.clientMeasId = newId;
              item.payload.clientId = newId;
              remainingMeas.push(item);
              continue;
            }
          }

          if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
            logger.warn(
              `Measurement log ${item.clientMeasId} failed with unrecoverable client error ${status} (${errMsg}). Discarding.`,
            );
            continue;
          }

          errors++;
          item.retryCount = (item.retryCount || 0) + 1;
          item.lastError = errMsg || 'Network error';
          remainingMeas.push(item);
        }
      }

      const measQueueLatest = await this.getPendingMeasurements();
      session.assertCurrent();
      await AsyncStorage.setItem(
        this.getMeasurementQueueKey(),
        JSON.stringify([
          ...measQueueLatest.filter((item) => !measQueueIds.has(item.clientMeasId)),
          ...remainingMeas,
        ]),
      );
      session.assertCurrent();

      if (syncedWeights > 0 || syncedMeasurements > 0) {
        this.notifySyncComplete();
      }

      return { syncedWeights, syncedMeasurements, errors };
    } finally {
      this.isSyncing = false;
    }
  }

  // --- Offline Cache Storage ---

  public async getCachedWeightHistory(range: string = 'W'): Promise<WeightHistoryResponse | null> {
    const session = captureUserSession();
    try {
      const raw = await AsyncStorage.getItem(this.getWeightCacheKey(range));
      session.assertCurrent();
      return raw ? JSON.parse(raw) : null;
    } catch {
      session.assertCurrent();
      return null;
    }
  }

  public async setCachedWeightHistory(range: string, data: WeightHistoryResponse): Promise<void> {
    const session = captureUserSession();
    try {
      await AsyncStorage.setItem(this.getWeightCacheKey(range), JSON.stringify(data));
      session.assertCurrent();
    } catch (err) {
      session.assertCurrent();
      logger.warn('Failed to cache weight history:', err);
    }
  }

  public async getCachedMeasurements(): Promise<MeasurementHistoryResponse | null> {
    const session = captureUserSession();
    try {
      const raw = await AsyncStorage.getItem(this.getMeasurementCacheKey());
      session.assertCurrent();
      return raw ? JSON.parse(raw) : null;
    } catch {
      session.assertCurrent();
      return null;
    }
  }

  public async setCachedMeasurements(data: MeasurementHistoryResponse): Promise<void> {
    const session = captureUserSession();
    try {
      await AsyncStorage.setItem(this.getMeasurementCacheKey(), JSON.stringify(data));
      session.assertCurrent();
    } catch (err) {
      session.assertCurrent();
      logger.warn('Failed to cache measurements:', err);
    }
  }

  public async clearUserCache(userId: string): Promise<void> {
    const session = captureUserSession();
    try {
      const ranges = ['D', 'W', 'M', 'Y'];
      const keys = [
        `@fitonus:pending_weight:${userId}`,
        `@fitonus:pending_measurements:${userId}`,
        `@fitonus:cached_measurements:${userId}`,
        ...ranges.map((r) => `@fitonus:cached_weight_${r}:${userId}`),
      ];
      await AsyncStorage.multiRemove(keys);
      session.assertCurrent();
    } catch (err) {
      session.assertCurrent();
      logger.warn('Failed to clear user progress cache:', err);
    }
  }
}

export const progressOfflineSync = new ProgressOfflineSyncService();
