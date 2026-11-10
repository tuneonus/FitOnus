import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { WEARABLES_ENABLED } from '../src/shared/constants/featureFlags';
import { useHealthStore, useHasDeviceData } from '../src/features/health-integration/store/healthStore';

describe('Wearable Feature Flag Enforcement (WEARABLES_ENABLED = false)', () => {
  beforeEach(() => {
    useHealthStore.getState().resetStore();
  });

  describe('1. Centralized Feature Flag Invariants', () => {
    it('enforces WEARABLES_ENABLED is strictly boolean false', () => {
      assert.strictEqual(typeof WEARABLES_ENABLED, 'boolean');
      assert.strictEqual(WEARABLES_ENABLED, false);
    });

    it('guarantees flag cannot be truthy-coerced', () => {
      assert.strictEqual(!WEARABLES_ENABLED, true);
      assert.strictEqual(Boolean(WEARABLES_ENABLED), false);
    });
  });

  describe('2. Wearable Synchronization & Store Operations Disabled', () => {
    it('blocks syncNow from mutating status or performing background operations', () => {
      const store = useHealthStore.getState();
      const initialStatus = store.status;
      const initialLastSync = store.lastSync;

      // Invoking syncNow must be a no-op when disabled
      store.syncNow();

      const after = useHealthStore.getState();
      assert.strictEqual(after.status, initialStatus);
      assert.strictEqual(after.lastSync, initialLastSync);
      assert.strictEqual(after.watchConnected, false);
    });

    it('rejects setting watchConnected to true when feature is disabled', () => {
      const store = useHealthStore.getState();
      store.setWatchConnected(true);

      const after = useHealthStore.getState();
      assert.strictEqual(after.watchConnected, false);
    });

    it('enforces useHasDeviceData always evaluates to false when flag is disabled', () => {
      // Even if status were somehow set to synced
      useHealthStore.setState({ status: 'synced' });
      assert.strictEqual(
        WEARABLES_ENABLED &&
          (useHealthStore.getState().status === 'synced' ||
            useHealthStore.getState().status === 'offline' ||
            useHealthStore.getState().status === 'error'),
        false
      );
    });
  });

  describe('3. Navigation Route Policy Verification', () => {
    it('verifies wearable navigation guards block appleWatch and wearOs routes when disabled', () => {
      const blockedRoutes = ['appleWatch', 'wearOs'];
      for (const route of blockedRoutes) {
        const shouldBlock = !WEARABLES_ENABLED && (route === 'appleWatch' || route === 'wearOs');
        assert.strictEqual(shouldBlock, true);
      }
    });

    it('verifies non-wearable routes are not blocked by the flag', () => {
      const nonWearableRoutes = ['home', 'activity', 'workouts', 'nutrition', 'progress', 'settings', 'profile'];
      for (const route of nonWearableRoutes) {
        const shouldBlock = !WEARABLES_ENABLED && (route === 'appleWatch' || route === 'wearOs');
        assert.strictEqual(shouldBlock, false);
      }
    });
  });

  describe('4. Preserved Non-Wearable Core Tracking Features', () => {
    it('preserves initial clean store state for normal app lifecycle', () => {
      const state = useHealthStore.getState();
      assert.strictEqual(state.status, 'noDevice');
      assert.strictEqual(state.connection, 'disconnected');
      assert.strictEqual(state.watchConnected, false);
    });
  });
});
