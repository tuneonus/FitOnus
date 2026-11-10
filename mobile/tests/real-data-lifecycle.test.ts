import { networkState } from './helpers/native-network';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../src/features/auth/stores/auth-store';
import { AuthRepository } from '../src/features/auth/api/auth-repository';
import { apiClient } from '../src/services/api-client';
import { queryClient } from '../src/providers/query-provider';
import { captureUserSession, SessionChangedError } from '../src/services/user-session';
import { SecureStorageService } from '../src/services/secure-storage';
import { useWorkoutStore } from '../src/features/workouts/store/workoutStore';
import { WorkoutService } from '../src/features/workouts/services/workout-service';
import { workoutApi } from '../src/features/workouts/api/workout-api';
import { offlineSyncService } from '../src/features/workouts/services/offline-sync';
import { useMemoryStore } from '../src/features/ai-memory/store/memoryStore';
import { useCoachStore } from '../src/features/ai-coach/store/coachStore';
import { CoachApi } from '../src/features/ai-coach/services/coach-api';
import { useProgressStore } from '../src/features/analytics/store/progressStore';
import { useAdvancedAnalyticsStore } from '../src/features/analytics/store/advancedAnalyticsStore';
import { analyticsApi } from '../src/features/analytics/api/analytics-api';
import { progressApi } from '../src/features/progress/api/progress-api';
import { useNutritionStore } from '../src/features/nutrition/store/nutritionStore';
import { nutritionApi } from '../src/features/nutrition/api/nutrition-api';
import type { SaveWorkoutSessionInput } from '../src/features/workouts/types/workout';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const signIn = (id: string) =>
  useAuthStore
    .getState()
    .setAuth({ id, name: id, email: `${id}@example.test`, isEmailVerified: true });
const payload: SaveWorkoutSessionInput = {
  clientSessionId: 'd9e98b11-a696-48c1-a706-217bcff23390',
  workoutName: 'User-entered session',
  startedAt: '2026-11-10T07:00:00Z',
  completedAt: '2026-11-10T07:10:00Z',
  durationSeconds: 600,
  sets: [
    { exerciseId: '757db721-d309-4bf9-82d3-6a3a90927cf5', setNumber: 1, weightKg: 20, reps: 8 },
  ],
};

describe('Real fitness data lifecycle regressions', () => {
  const originals = {
    adapter: apiClient.defaults.adapter,
    refresh: AuthRepository.refreshToken,
    sessions: workoutApi.getWorkoutSessions,
    save: workoutApi.saveWorkoutSession,
    memories: CoachApi.listMemories,
    analytics: progressApi.getAnalytics,
    body: analyticsApi.getBody,
    daily: nutritionApi.getDailyNutrition,
    water: nutritionApi.logWater,
    getItem: AsyncStorage.getItem,
    setItem: AsyncStorage.setItem,
  };
  const storage = new Map<string, string>();
  beforeEach(() => {
    networkState.isConnected = false;
    networkState.isInternetReachable = false;
    signIn('account-a');
    storage.clear();
    AsyncStorage.getItem = async (key) => storage.get(key) ?? null;
    AsyncStorage.setItem = async (key, value) => {
      storage.set(key, value);
    };
  });
  afterEach(() => {
    apiClient.defaults.adapter = originals.adapter;
    AuthRepository.refreshToken = originals.refresh;
    workoutApi.getWorkoutSessions = originals.sessions;
    workoutApi.saveWorkoutSession = originals.save;
    CoachApi.listMemories = originals.memories;
    progressApi.getAnalytics = originals.analytics;
    analyticsApi.getBody = originals.body;
    nutritionApi.getDailyNutrition = originals.daily;
    nutritionApi.logWater = originals.water;
    AsyncStorage.getItem = originals.getItem;
    AsyncStorage.setItem = originals.setItem;
    useAuthStore.getState().clearAuth();
    queryClient.clear();
  });

  it('rejects a previous account response and clears user caches immediately', async () => {
    const sent = deferred<void>();
    const result = deferred<any>();
    apiClient.defaults.adapter = async (config) => {
      sent.resolve();
      return { config, data: await result.promise, status: 200, statusText: 'OK', headers: {} };
    };
    queryClient.setQueryData(['dashboard', 'account-a'], { private: true });
    const request = apiClient.get('/dashboard/summary');
    await sent.promise;
    signIn('account-b');
    assert.equal(queryClient.getQueryData(['dashboard', 'account-a']), undefined);
    result.resolve({ success: true, data: { belongsTo: 'account-a' } });
    await assert.rejects(request, SessionChangedError);
  });

  it('does not restore old tokens or retry a request after a refresh crosses account switching', async () => {
    const refreshing = deferred<void>();
    const tokens = deferred<{ accessToken: string; refreshToken: string }>();
    AuthRepository.refreshToken = async () => {
      refreshing.resolve();
      return tokens.promise;
    };
    let requests = 0;
    apiClient.defaults.adapter = async (config) => {
      requests++;
      throw { config, response: { status: 401, data: { error: { message: 'Expired' } } } };
    };
    await SecureStorageService.setItem('auth.access_token', 'old-access');
    await SecureStorageService.setItem('auth.refresh_token', 'old-refresh');
    const request = apiClient.get('/progress/weight');
    await refreshing.promise;
    signIn('account-b');
    await SecureStorageService.setItem('auth.access_token', 'new-account-access');
    await SecureStorageService.setItem('auth.refresh_token', 'new-account-refresh');
    tokens.resolve({ accessToken: 'refreshed-old-access', refreshToken: 'refreshed-old-refresh' });
    await assert.rejects(request, SessionChangedError);
    assert.equal(await SecureStorageService.getItem('auth.access_token'), 'new-account-access');
    assert.equal(requests, 1);
  });

  it('clears coach and memory stores on expiry and ignores an in-flight memory response', async () => {
    const response = deferred<any>();
    CoachApi.listMemories = () => response.promise;
    useCoachStore.getState().setConversationId('private-conversation');
    const loading = useMemoryStore.getState().fetchMemories();
    useAuthStore.getState().clearAuth();
    response.resolve({
      enabled: true,
      items: [{ id: 'old-memory', category: 'goals', text: 'Private' }],
      suggestions: [],
    });
    await loading;
    assert.deepEqual(useMemoryStore.getState().items, []);
    assert.equal(useCoachStore.getState().conversationId, null);
  });

  it('separates offline workout queues and ignores unowned legacy entries', async () => {
    storage.set('@fitonus:pending_workout_sessions', JSON.stringify([{ payload }]));
    await offlineSyncService.enqueueSession(payload);
    assert.equal((await offlineSyncService.getPendingSessions()).length, 1);
    signIn('account-b');
    assert.deepEqual(await offlineSyncService.getPendingSessions(), []);
    signIn('account-a');
    assert.equal(
      (await offlineSyncService.getPendingSessions())[0]?.clientSessionId,
      payload.clientSessionId,
    );
    assert.ok(storage.has('@fitonus:pending_workout_sessions:account-a'));
  });

  it('prevents an interrupted enqueue from writing account A data to account B', async () => {
    const read = deferred<string | null>();
    AsyncStorage.getItem = () => read.promise;
    const enqueuing = offlineSyncService.enqueueSession(payload);
    signIn('account-b');
    read.resolve(null);
    await assert.rejects(enqueuing, SessionChangedError);
    assert.equal(storage.has('@fitonus:pending_workout_sessions:account-b'), false);
  });

  it('stops a multi-item sync on account change without uploading or rewriting the other account’s queue', async () => {
    networkState.isConnected = true;
    networkState.isInternetReachable = true;
    await offlineSyncService.enqueueSession(payload);
    await offlineSyncService.enqueueSession({
      ...payload,
      clientSessionId: 'bdb2a4ba-4560-4441-ad50-cd161a2b5f14',
    });
    const started = deferred<void>();
    const response = deferred<any>();
    let writes = 0;
    workoutApi.saveWorkoutSession = async () => {
      writes++;
      started.resolve();
      return response.promise;
    };
    const syncing = offlineSyncService.syncPendingSessions();
    await started.promise;
    signIn('account-b');
    response.resolve({ id: 'account-a-session' });
    await assert.rejects(syncing, SessionChangedError);
    assert.equal(writes, 1);
    assert.equal(storage.has('@fitonus:pending_workout_sessions:account-b'), false);
    signIn('account-a');
    assert.equal((await offlineSyncService.getPendingSessions()).length, 2);
  });

  it('retains the completed workout for retry when the server rejects a save', async () => {
    workoutApi.saveWorkoutSession = async () => {
      throw { response: { status: 422 } };
    };
    useWorkoutStore.setState({
      elapsedSec: 600,
      active: [
        {
          exerciseId: payload.sets[0]!.exerciseId,
          restSec: 60,
          targetReps: '8',
          skipped: false,
          sets: [{ weight: 20, reps: 8, done: true }],
        },
      ],
    });
    const completed = useWorkoutStore.getState().finishSession();
    const saved = await useWorkoutStore.getState().saveCompleted('Effort: Solid');
    assert.equal(saved, false);
    assert.equal(useWorkoutStore.getState().lastCompleted?.id, completed.id);
    assert.deepEqual(useWorkoutStore.getState().history, []);
    assert.deepEqual(await offlineSyncService.getPendingSessions(), []);
  });

  it('clears completed history when the server returns no sessions', async () => {
    useWorkoutStore.setState({
      history: [
        {
          id: 'removed',
          date: 'Today',
          title: 'Removed on server',
          sets: 1,
          prs: 0,
          calories: 1,
          volumeKg: 20,
          durationMin: 10,
          exercises: [],
          source: 'FitOnus',
          pendingSync: false,
        },
      ],
    });
    workoutApi.getWorkoutSessions = async () => ({
      sessions: [],
      total: 0,
      page: 1,
      totalPages: 0,
    });
    await useWorkoutStore.getState().loadHistoryFromBackend();
    assert.deepEqual(useWorkoutStore.getState().history, []);
  });

  it('does not invent PRs, heart rate, or empty workout sets', async () => {
    useWorkoutStore.setState({
      elapsedSec: 600,
      active: [
        {
          exerciseId: payload.sets[0]!.exerciseId,
          restSec: 60,
          targetReps: '8',
          skipped: false,
          sets: [{ weight: 80, reps: 8, done: true }],
        },
      ],
    });
    const finished = useWorkoutStore.getState().finishSession();
    assert.equal(finished.prs, 0);
    assert.equal(finished.avgHr, undefined);
    assert.equal(finished.pendingSync, true);
    await assert.rejects(WorkoutService.saveSession({ ...payload, sets: [] }), /at least one set/);
    assert.deepEqual(await offlineSyncService.getPendingSessions(), []);
  });

  it('surfaces validation failures instead of pretending they were saved offline', async () => {
    workoutApi.saveWorkoutSession = async () => {
      throw { response: { status: 422 } };
    };
    await assert.rejects(WorkoutService.saveSession(payload));
    assert.deepEqual(await offlineSyncService.getPendingSessions(), []);
  });

  it('revalidates previously loaded progress on screen focus rather than using an indefinite cache', async () => {
    let reads = 0;
    progressApi.getAnalytics = async () => ({
      metric: 'weight',
      label: 'Weight',
      unit: 'kg',
      chart: 'line',
      hasDeviceData: false,
      firstValue: ++reads,
      latestValue: reads,
      delta: 0,
      points: [{ label: 'Today', value: reads }],
    });
    await useProgressStore.getState().fetchAnalytics('weight', 'M');
    await useProgressStore.getState().fetchAnalytics('weight', 'M');
    assert.equal(reads, 2);
    assert.equal(useProgressStore.getState().analyticsData['weight-M']?.latestValue, 2);
  });

  it('ignores a late daily nutrition response after selecting another date', async () => {
    const daily = deferred<any>();
    nutritionApi.getDailyNutrition = () => daily.promise;
    useNutritionStore.setState({ selectedDate: '2026-11-09' });
    const loading = useNutritionStore.getState().fetchDailyNutrition();
    useNutritionStore.setState({
      selectedDate: '2026-11-10',
      entries: [],
      dailySummary: null,
      waterMl: 0,
    });
    daily.resolve({ date: '2026-11-09', meals: [], consumed: { waterMl: 1000 } });
    await loading;
    assert.equal(useNutritionStore.getState().dailySummary, null);
    assert.equal(useNutritionStore.getState().waterMl, 0);
  });

  it('does not suppress a second account’s hydration log as another account’s rapid tap', async () => {
    let writes = 0;
    nutritionApi.logWater = async () => {
      writes++;
      return {} as any;
    };
    nutritionApi.getDailyNutrition = async (date) =>
      ({ date, meals: [], consumed: { waterMl: 0 } }) as any;
    await useNutritionStore.getState().logWater(250);
    signIn('account-b');
    await useNutritionStore.getState().logWater(250);
    assert.equal(writes, 2);
  });

  it('invalidates advanced-analytics request sequences when authentication changes', async () => {
    const response = deferred<any>();
    analyticsApi.getBody = () => response.promise;
    const loading = useAdvancedAnalyticsStore.getState().fetchBody('M');
    signIn('account-b');
    response.resolve({ currentWeightKg: 80, weightTrend: [] });
    assert.equal(await loading, null);
    assert.deepEqual(useAdvancedAnalyticsStore.getState().body, {});
  });

  it('invalidates captured work even when the same user signs back in', () => {
    const owner = captureUserSession();
    useAuthStore.getState().clearAuth();
    signIn('account-a');
    assert.equal(owner.isCurrent(), false);
  });
});
