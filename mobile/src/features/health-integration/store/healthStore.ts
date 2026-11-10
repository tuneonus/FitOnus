import { registerUserStore } from '@/services/user-session';
import { create } from 'zustand';
import type { HealthPlatform, HealthStatus } from '../../../shared/types/health';
import { healthMetrics } from '../constants/healthMetrics';

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

type HealthState = {
  status: HealthStatus;
  platform: HealthPlatform;
  connection: ConnectionState;
  lastSync: string;
  permissions: Record<string, boolean>;
  watchConnected: boolean;
  setStatus: (status: HealthStatus) => void;
  setPlatform: (platform: HealthPlatform) => void;
  setConnection: (connection: ConnectionState) => void;
  setPermission: (key: string, value: boolean) => void;
  setAllPermissions: (value: boolean) => void;
  syncNow: () => void;
  setWatchConnected: (value: boolean) => void;
  resetStore: () => void;
};

const allPermissions = (value: boolean) =>
  Object.fromEntries(
    healthMetrics.map((m) => [m.key, m.availability === 'unavailable' ? false : value]),
  );

export const useHealthStore = create<HealthState>((set, get) => ({
  status: 'noDevice',
  platform: 'ios',
  connection: 'disconnected',
  lastSync: '',
  permissions: allPermissions(false),
  watchConnected: false,
  resetStore: () =>
    set({
      status: 'noDevice',
      connection: 'disconnected',
      lastSync: '',
      permissions: allPermissions(false),
      watchConnected: false,
    }),
  setStatus: (status) =>
    set({
      status,
      connection:
        status === 'noDevice' ? 'disconnected' : status === 'error' ? 'error' : 'connected',
    }),
  setPlatform: (platform) => set({ platform }),
  setConnection: (connection) =>
    set({
      connection,
      status: connection === 'connected' ? 'synced' : connection === 'error' ? 'error' : 'noDevice',
    }),
  setPermission: (key, value) => {
    const permissions = { ...get().permissions, [key]: value };
    const missingCore = !permissions.sleep || !permissions.hrv;
    set({
      permissions,
      status:
        get().connection === 'connected' ? (missingCore ? 'permissions' : 'synced') : get().status,
    });
  },
  setAllPermissions: (value) => set({ permissions: allPermissions(value) }),
  syncNow: () => {
    // No native health provider or backend ingestion endpoint exists in this build.
    set({ status: 'noDevice', connection: 'disconnected', lastSync: '', watchConnected: false });
  },
  setWatchConnected: (watchConnected) => set({ watchConnected }),
}));

export const useHasDeviceData = () =>
  useHealthStore((s) => s.status === 'synced' || s.status === 'offline' || s.status === 'error');

registerUserStore(useHealthStore);
