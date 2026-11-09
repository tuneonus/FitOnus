'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/context/ToastContext';
import { settingsApi } from '../api';
import type {
  AppSettingKey,
  AppSettingRecord,
  MaintenanceSettingValue,
  MinVersionSettingValue,
  ForceUpdateSettingValue,
  SupportSettingValue,
  LegalSettingValue,
  FeatureFlagsSettingValue,
  AiLimitsSettingValue,
  AiUsageStats,
  UpdateSettingPayloadItem,
} from '../types';

const DEFAULT_MAINTENANCE: MaintenanceSettingValue = {
  enabled: false,
  message: 'FitOnus is currently undergoing scheduled maintenance. Please check back shortly.',
  expectedEndTime: null,
};

const DEFAULT_MIN_VERSION: MinVersionSettingValue = {
  androidMinVersion: '1.0.0',
};

const DEFAULT_FORCE_UPDATE: ForceUpdateSettingValue = {
  enabled: false,
  updateMessage: 'A critical update is required to continue using FitOnus. Please update from the Google Play Store.',
  storeUrl: 'https://play.google.com/store/apps/details?id=com.fitonus.app',
};

const DEFAULT_SUPPORT: SupportSettingValue = {
  email: 'support@fitonus.com',
  website: 'https://fitonus.com/support',
  contactInfo: '+1 (800) 555-ONUS',
};

const DEFAULT_LEGAL: LegalSettingValue = {
  privacyPolicyUrl: 'https://fitonus.com/privacy',
  termsOfServiceUrl: 'https://fitonus.com/terms',
};

const DEFAULT_FEATURES: FeatureFlagsSettingValue = {
  aiCoach: true,
  mealPhotoScanner: true,
  voiceMealEntry: true,
  workoutGenerator: true,
};

const DEFAULT_AI_LIMITS: AiLimitsSettingValue = {
  dailyGlobalLimit: 100,
  coachChatDailyLimit: 50,
  mealPhotoDailyLimit: 20,
  voiceMealDailyLimit: 20,
  workoutGeneratorDailyLimit: 10,
};

const DEFAULT_AI_STATS: AiUsageStats = {
  todayTotalRequests: 0,
  todayActiveAiUsers: 0,
  breakdownByAction: {
    coach_chat: 0,
    meal_photo: 0,
    voice_meal: 0,
    workout_generator: 0,
  },
};

export function useAppSettings() {
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Server state
  const [records, setRecords] = useState<Record<string, AppSettingRecord>>({});
  const [aiUsageStats, setAiUsageStats] = useState<AiUsageStats>(DEFAULT_AI_STATS);

  // Local draft state
  const [maintenanceDraft, setMaintenanceDraft] = useState<MaintenanceSettingValue>(DEFAULT_MAINTENANCE);
  const [minVersionDraft, setMinVersionDraft] = useState<MinVersionSettingValue>(DEFAULT_MIN_VERSION);
  const [forceUpdateDraft, setForceUpdateDraft] = useState<ForceUpdateSettingValue>(DEFAULT_FORCE_UPDATE);
  const [supportDraft, setSupportDraft] = useState<SupportSettingValue>(DEFAULT_SUPPORT);
  const [legalDraft, setLegalDraft] = useState<LegalSettingValue>(DEFAULT_LEGAL);
  const [featuresDraft, setFeaturesDraft] = useState<FeatureFlagsSettingValue>(DEFAULT_FEATURES);
  const [aiLimitsDraft, setAiLimitsDraft] = useState<AiLimitsSettingValue>(DEFAULT_AI_LIMITS);

  const populateFromRecords = useCallback((settingRecords: AppSettingRecord[], stats?: AiUsageStats) => {
    const recordMap: Record<string, AppSettingRecord> = {};
    for (const r of settingRecords) {
      recordMap[r.key] = r;
    }
    setRecords(recordMap);

    if (recordMap['app.maintenance']) {
      setMaintenanceDraft(recordMap['app.maintenance'].value as MaintenanceSettingValue);
    }
    if (recordMap['app.min_version']) {
      setMinVersionDraft(recordMap['app.min_version'].value as MinVersionSettingValue);
    }
    if (recordMap['app.force_update']) {
      setForceUpdateDraft(recordMap['app.force_update'].value as ForceUpdateSettingValue);
    }
    if (recordMap['app.support']) {
      setSupportDraft(recordMap['app.support'].value as SupportSettingValue);
    }
    if (recordMap['app.legal']) {
      setLegalDraft(recordMap['app.legal'].value as LegalSettingValue);
    }
    if (recordMap['features.flags']) {
      setFeaturesDraft(recordMap['features.flags'].value as FeatureFlagsSettingValue);
    }
    if (recordMap['ai.limits']) {
      setAiLimitsDraft(recordMap['ai.limits'].value as AiLimitsSettingValue);
    }
    if (stats) {
      setAiUsageStats(stats);
    }
  }, []);

  const loadSettings = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const res = await settingsApi.getSettings();
      populateFromRecords(res.settings, res.aiUsageStats);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load application settings';
      setError(msg);
      toast.error(msg, { title: 'Loading Failed' });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [populateFromRecords, toast]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Dirty state checks
  const isMaintenanceDirty = useMemo(() => {
    const server = (records['app.maintenance']?.value as MaintenanceSettingValue) || DEFAULT_MAINTENANCE;
    return JSON.stringify(server) !== JSON.stringify(maintenanceDraft);
  }, [records, maintenanceDraft]);

  const isMinVersionDirty = useMemo(() => {
    const server = (records['app.min_version']?.value as MinVersionSettingValue) || DEFAULT_MIN_VERSION;
    return JSON.stringify(server) !== JSON.stringify(minVersionDraft);
  }, [records, minVersionDraft]);

  const isForceUpdateDirty = useMemo(() => {
    const server = (records['app.force_update']?.value as ForceUpdateSettingValue) || DEFAULT_FORCE_UPDATE;
    return JSON.stringify(server) !== JSON.stringify(forceUpdateDraft);
  }, [records, forceUpdateDraft]);

  const isSupportDirty = useMemo(() => {
    const server = (records['app.support']?.value as SupportSettingValue) || DEFAULT_SUPPORT;
    return JSON.stringify(server) !== JSON.stringify(supportDraft);
  }, [records, supportDraft]);

  const isLegalDirty = useMemo(() => {
    const server = (records['app.legal']?.value as LegalSettingValue) || DEFAULT_LEGAL;
    return JSON.stringify(server) !== JSON.stringify(legalDraft);
  }, [records, legalDraft]);

  const isFeaturesDirty = useMemo(() => {
    const server = (records['features.flags']?.value as FeatureFlagsSettingValue) || DEFAULT_FEATURES;
    return JSON.stringify(server) !== JSON.stringify(featuresDraft);
  }, [records, featuresDraft]);

  const isAiLimitsDirty = useMemo(() => {
    const server = (records['ai.limits']?.value as AiLimitsSettingValue) || DEFAULT_AI_LIMITS;
    return JSON.stringify(server) !== JSON.stringify(aiLimitsDraft);
  }, [records, aiLimitsDraft]);

  const isDirty = useMemo(() => {
    return (
      isMaintenanceDirty ||
      isMinVersionDirty ||
      isForceUpdateDirty ||
      isSupportDirty ||
      isLegalDirty ||
      isFeaturesDirty ||
      isAiLimitsDirty
    );
  }, [
    isMaintenanceDirty,
    isMinVersionDirty,
    isForceUpdateDirty,
    isSupportDirty,
    isLegalDirty,
    isFeaturesDirty,
    isAiLimitsDirty,
  ]);

  const resetDraft = useCallback(() => {
    const recordList = Object.values(records);
    populateFromRecords(recordList);
    toast.info('All form fields have been reset to current database values', {
      title: 'Changes Discarded',
    });
  }, [records, populateFromRecords, toast]);

  // Client-side validation
  const validateSettings = useCallback((): string | null => {
    // Validate URLs if provided
    const isValidUrl = (url: string) => {
      if (!url) return true;
      try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    };

    const isValidEmail = (email: string) => {
      if (!email) return true;
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };

    if (forceUpdateDraft.storeUrl && !isValidUrl(forceUpdateDraft.storeUrl)) {
      return 'Store URL must be a valid HTTP/HTTPS URL';
    }
    if (supportDraft.website && !isValidUrl(supportDraft.website)) {
      return 'Support website must be a valid HTTP/HTTPS URL';
    }
    if (supportDraft.email && !isValidEmail(supportDraft.email)) {
      return 'Support email must be a valid email address';
    }
    if (legalDraft.privacyPolicyUrl && !isValidUrl(legalDraft.privacyPolicyUrl)) {
      return 'Privacy policy URL must be a valid HTTP/HTTPS URL';
    }
    if (legalDraft.termsOfServiceUrl && !isValidUrl(legalDraft.termsOfServiceUrl)) {
      return 'Terms of service URL must be a valid HTTP/HTTPS URL';
    }

    // Validate numbers
    if (aiLimitsDraft.dailyGlobalLimit < 1) {
      return 'Daily global AI limit must be at least 1';
    }
    if (aiLimitsDraft.coachChatDailyLimit < 0 || aiLimitsDraft.mealPhotoDailyLimit < 0 || aiLimitsDraft.voiceMealDailyLimit < 0 || aiLimitsDraft.workoutGeneratorDailyLimit < 0) {
      return 'AI action limits cannot be negative';
    }

    return null;
  }, [forceUpdateDraft, supportDraft, legalDraft, aiLimitsDraft]);

  // Save selected settings or all dirty settings
  const saveSettings = useCallback(
    async (specificKeys?: AppSettingKey[]) => {
      const validationError = validateSettings();
      if (validationError) {
        toast.error(validationError, { title: 'Validation Error' });
        return false;
      }

      const updates: UpdateSettingPayloadItem[] = [];

      const checkAndAdd = (
        key: AppSettingKey,
        isChanged: boolean,
        value: unknown
      ) => {
        if (specificKeys ? specificKeys.includes(key) : isChanged) {
          updates.push({
            key,
            value,
            expectedVersion: records[key]?.version,
          });
        }
      };

      checkAndAdd('app.maintenance', isMaintenanceDirty, maintenanceDraft);
      checkAndAdd('app.min_version', isMinVersionDirty, minVersionDraft);
      checkAndAdd('app.force_update', isForceUpdateDirty, forceUpdateDraft);
      checkAndAdd('app.support', isSupportDirty, supportDraft);
      checkAndAdd('app.legal', isLegalDirty, legalDraft);
      checkAndAdd('features.flags', isFeaturesDirty, featuresDraft);
      checkAndAdd('ai.limits', isAiLimitsDirty, aiLimitsDraft);

      if (updates.length === 0) {
        toast.info('No changes to save');
        return true;
      }

      try {
        setIsSaving(true);
        const updatedRecords = await settingsApi.updateSettings(updates);

        // Update local records
        setRecords((prev) => {
          const next = { ...prev };
          for (const rec of updatedRecords) {
            next[rec.key] = rec;
          }
          return next;
        });

        toast.success(
          `Successfully saved ${updates.length} setting group(s) to Neon DEV`,
          { title: 'Settings Updated' }
        );
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to save settings';
        toast.error(msg, { title: 'Save Failed' });
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [
      validateSettings,
      records,
      isMaintenanceDirty,
      maintenanceDraft,
      isMinVersionDirty,
      minVersionDraft,
      isForceUpdateDirty,
      forceUpdateDraft,
      isSupportDirty,
      supportDraft,
      isLegalDirty,
      legalDraft,
      isFeaturesDirty,
      featuresDraft,
      isAiLimitsDirty,
      aiLimitsDraft,
      toast,
    ]
  );

  return {
    isLoading,
    isSaving,
    isRefreshing,
    error,
    records,
    aiUsageStats,
    isDirty,
    // Draft states and setters
    maintenanceDraft,
    setMaintenanceDraft,
    minVersionDraft,
    setMinVersionDraft,
    forceUpdateDraft,
    setForceUpdateDraft,
    supportDraft,
    setSupportDraft,
    legalDraft,
    setLegalDraft,
    featuresDraft,
    setFeaturesDraft,
    aiLimitsDraft,
    setAiLimitsDraft,
    // Dirty breakdown
    isMaintenanceDirty,
    isMinVersionDirty,
    isForceUpdateDirty,
    isSupportDirty,
    isLegalDirty,
    isFeaturesDirty,
    isAiLimitsDirty,
    // Actions
    saveSettings,
    resetDraft,
    refresh: () => loadSettings(true),
  };
}
