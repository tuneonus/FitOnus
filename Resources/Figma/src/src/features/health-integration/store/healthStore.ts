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
};

const allPermissions = (value: boolean) =>
Object.fromEntries(healthMetrics.map((m) => [m.key, m.availability === 'unavailable' ? false : value]));

export const useHealthStore = create<HealthState>((set, get) => ({
  status: 'synced',
  platform: 'ios',
  connection: 'connected',
  lastSync: '9:38 AM',
  permissions: allPermissions(true),
  watchConnected: true,
  setStatus: (status) =>
  set({
    status,
    connection: status === 'noDevice' ? 'disconnected' : status === 'error' ? 'error' : 'connected'
  }),
  setPlatform: (platform) => set({ platform }),
  setConnection: (connection) =>
  set({ connection, status: connection === 'connected' ? 'synced' : connection === 'error' ? 'error' : 'noDevice' }),
  setPermission: (key, value) => {
    const permissions = { ...get().permissions, [key]: value };
    const missingCore = !permissions.sleep || !permissions.hrv;
    set({ permissions, status: get().connection === 'connected' ? missingCore ? 'permissions' : 'synced' : get().status });
  },
  setAllPermissions: (value) => set({ permissions: allPermissions(value) }),
  syncNow: () => {
    set({ status: 'loading' });
    setTimeout(() => set({ status: 'synced', connection: 'connected', lastSync: 'Just now' }), 1200);
  },
  setWatchConnected: (watchConnected) => set({ watchConnected })
}));

export const useHasDeviceData = () =>
useHealthStore((s) => s.status === 'synced' || s.status === 'offline' || s.status === 'error');