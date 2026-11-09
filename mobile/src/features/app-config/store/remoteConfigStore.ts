import { create } from 'zustand';
import { AppState, type AppStateStatus } from 'react-native';
import {
  configService,
  DEFAULT_PUBLIC_APP_CONFIG,
  type PublicAppConfig,
  type FeatureFlagsConfig,
} from '../../../services/configService';
import { Config } from '../../../constants/config';
import { isVersionBelowMinimum } from '../../../shared/utils/versionCompare';

interface RemoteConfigState {
  config: PublicAppConfig;
  isLoading: boolean;
  lastFetchedAt: number;
  isMaintenance: boolean;
  isForceUpdate: boolean;

  fetchConfig: (force?: boolean) => Promise<void>;
  isFeatureEnabled: (featureName: keyof FeatureFlagsConfig) => boolean;
  init: () => void;
}

export const useRemoteConfigStore = create<RemoteConfigState>((set, get) => ({
  config: DEFAULT_PUBLIC_APP_CONFIG,
  isLoading: false,
  lastFetchedAt: 0,
  isMaintenance: false,
  isForceUpdate: false,

  fetchConfig: async (force = false) => {
    set({ isLoading: true });
    try {
      const freshConfig = await configService.getConfig(force);
      const isMaint = !!freshConfig.maintenance.enabled;
      const isForce =
        !!freshConfig.forceUpdate.enabled &&
        isVersionBelowMinimum(Config.APP_VERSION, freshConfig.minVersion.androidMinVersion);

      set({
        config: freshConfig,
        isLoading: false,
        lastFetchedAt: Date.now(),
        isMaintenance: isMaint,
        isForceUpdate: isForce,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  isFeatureEnabled: (featureName: keyof FeatureFlagsConfig) => {
    return !!get().config.features[featureName];
  },

  init: () => {
    // Initial fetch
    get().fetchConfig(true);

    // Listen to AppState changes (e.g. background to foreground)
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        const lastFetched = get().lastFetchedAt;
        // Throttle to 60 seconds
        if (Date.now() - lastFetched > 60000) {
          get().fetchConfig(false);
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      sub.remove();
    };
  },
}));
