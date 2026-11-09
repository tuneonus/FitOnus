import { Config } from '../constants/config';
import { StorageService } from './storage';
import { logger } from '../utils/logger';
import { isVersionBelowMinimum } from '../shared/utils/versionCompare';

export interface MaintenanceConfig {
  enabled: boolean;
  message: string;
  expectedEndTime: string | null;
}

export interface MinVersionConfig {
  androidMinVersion: string;
}

export interface ForceUpdateConfig {
  enabled: boolean;
  updateMessage: string;
  storeUrl: string;
}

export interface SupportConfig {
  email: string;
  website: string;
  contactInfo: string;
}

export interface LegalConfig {
  privacyPolicyUrl: string;
  termsOfServiceUrl: string;
}

export interface FeatureFlagsConfig {
  aiCoach: boolean;
  mealPhotoScanner: boolean;
  voiceMealEntry: boolean;
  workoutGenerator: boolean;
}

export interface AiLimitsConfig {
  dailyGlobalLimit: number;
  coachChatDailyLimit: number;
  mealPhotoDailyLimit: number;
  voiceMealDailyLimit: number;
  workoutGeneratorDailyLimit: number;
}

export interface PublicAppConfig {
  maintenance: MaintenanceConfig;
  minVersion: MinVersionConfig;
  forceUpdate: ForceUpdateConfig;
  support: SupportConfig;
  legal: LegalConfig;
  features: FeatureFlagsConfig;
  aiLimits: AiLimitsConfig;
}

export const DEFAULT_PUBLIC_APP_CONFIG: PublicAppConfig = {
  maintenance: {
    enabled: false,
    message: 'FitOnus is currently undergoing scheduled maintenance. Please check back shortly.',
    expectedEndTime: null,
  },
  minVersion: {
    androidMinVersion: '1.0.0',
  },
  forceUpdate: {
    enabled: false,
    updateMessage: 'A critical update is required to continue using FitOnus. Please update from the Google Play Store.',
    storeUrl: 'https://play.google.com/store/apps/details?id=com.fitonus.app',
  },
  support: {
    email: 'support@fitonus.com',
    website: 'https://fitonus.com/support',
    contactInfo: '+1 (800) 555-ONUS',
  },
  legal: {
    privacyPolicyUrl: 'https://fitonus.com/privacy',
    termsOfServiceUrl: 'https://fitonus.com/terms',
  },
  features: {
    aiCoach: true,
    mealPhotoScanner: true,
    voiceMealEntry: true,
    workoutGenerator: true,
  },
  aiLimits: {
    dailyGlobalLimit: 100,
    coachChatDailyLimit: 50,
    mealPhotoDailyLimit: 20,
    voiceMealDailyLimit: 20,
    workoutGeneratorDailyLimit: 10,
  },
};

const CACHE_KEY = 'fitonus.remote_app_config';
const CACHED_AT_KEY = 'fitonus.remote_app_config_timestamp';
const CACHE_TTL_MS = 60 * 1000; // 1 minute in-memory throttle

let inMemoryConfig: PublicAppConfig = DEFAULT_PUBLIC_APP_CONFIG;
let lastFetchedTimestamp = 0;
let isFetchInProgress = false;

export const configService = {
  /**
   * Retrieves the current application configuration.
   * Uses cached configuration if fetched recently, or fetches from backend.
   * Safely falls back to persistent storage or defaults if network is unavailable.
   */
  async getConfig(forceRefresh = false): Promise<PublicAppConfig> {
    const now = Date.now();

    // Use memory cache if valid and not forcing refresh
    if (!forceRefresh && lastFetchedTimestamp > 0 && now - lastFetchedTimestamp < CACHE_TTL_MS) {
      return inMemoryConfig;
    }

    if (isFetchInProgress) {
      return inMemoryConfig;
    }

    isFetchInProgress = true;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const endpoint = `${Config.API_BASE_URL}/app/config`;
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const payload = await response.json();
        const data: PublicAppConfig = payload.data || payload;

        if (data && data.features && data.maintenance) {
          inMemoryConfig = data;
          lastFetchedTimestamp = now;

          // Asynchronously persist to offline storage
          StorageService.setItem(CACHE_KEY, JSON.stringify(data)).catch((e) =>
            logger.error('Failed to cache remote config:', e)
          );
          StorageService.setItem(CACHED_AT_KEY, String(now)).catch(() => {});

          return inMemoryConfig;
        }
      }
    } catch (err) {
      logger.warn('Failed to fetch remote app config from backend, attempting storage fallback:', err);
    } finally {
      isFetchInProgress = false;
    }

    // Try reading cached value from persistent storage
    try {
      const cached = await StorageService.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as PublicAppConfig;
        if (parsed?.features && parsed?.maintenance) {
          inMemoryConfig = parsed;
          return inMemoryConfig;
        }
      }
    } catch (e) {
      logger.error('Failed to parse cached app config:', e);
    }

    return inMemoryConfig;
  },

  /**
   * Returns in-memory configuration synchronously without network delay.
   */
  getCurrentConfigSync(): PublicAppConfig {
    return inMemoryConfig;
  },

  /**
   * Checks whether a specific feature flag is currently active.
   */
  isFeatureEnabled(featureName: keyof FeatureFlagsConfig): boolean {
    return !!inMemoryConfig.features[featureName];
  },

  /**
   * Returns whether maintenance mode is active.
   */
  isMaintenanceActive(): boolean {
    return !!inMemoryConfig.maintenance.enabled;
  },

  /**
   * Returns whether a force update is required for the specified or installed app version.
   */
  isForceUpdateRequired(currentVersion: string = Config.APP_VERSION): boolean {
    if (!inMemoryConfig.forceUpdate.enabled) {
      return false;
    }
    const minVersion = inMemoryConfig.minVersion.androidMinVersion;
    return isVersionBelowMinimum(currentVersion, minVersion);
  },
};
