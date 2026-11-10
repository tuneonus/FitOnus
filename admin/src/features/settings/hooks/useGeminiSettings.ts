'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/context/ToastContext';
import { geminiAdminApi } from '../api-ai';
import type {
  GeminiConfigResponse,
  GeminiModelInfo,
  GeminiUsageSummaryResponse,
  FeatureUsageBreakdown,
  ModelUsageBreakdown,
  DailyUsageTrend,
  GeminiUsageEventItem,
  TestGeminiConnectionResponse,
} from '../types-ai';

export function useGeminiSettings() {
  const { toast } = useToast();

  // Core Data
  const [config, setConfig] = useState<GeminiConfigResponse | null>(null);
  const [models, setModels] = useState<GeminiModelInfo[]>([]);
  const [usageSummary, setUsageSummary] = useState<GeminiUsageSummaryResponse | null>(null);
  const [featureBreakdown, setFeatureBreakdown] = useState<FeatureUsageBreakdown[]>([]);
  const [modelBreakdown, setModelBreakdown] = useState<ModelUsageBreakdown[]>([]);
  const [trends, setTrends] = useState<DailyUsageTrend[]>([]);

  // Telemetry Events Table
  const [events, setEvents] = useState<GeminiUsageEventItem[]>([]);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [eventsLimit, setEventsLimit] = useState(15);
  const [eventsOffset, setEventsOffset] = useState(0);
  const [eventsFeatureFilter, setEventsFeatureFilter] = useState('');

  // Statuses
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingActiveKey, setIsTestingActiveKey] = useState(false);
  const [isTestingCandidateKey, setIsTestingCandidateKey] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [isRefreshingEvents, setIsRefreshingEvents] = useState(false);

  // Active Connection Test Result
  const [activeTestResult, setActiveTestResult] = useState<TestGeminiConnectionResponse | null>(null);

  // Model Draft Selection
  const [modelDraft, setModelDraft] = useState({
    defaultModel: 'gemini-2.5-flash',
    coachModel: 'gemini-2.5-flash',
    mealPhotoModel: 'gemini-2.5-flash',
    voiceMealModel: 'gemini-2.5-flash',
    workoutGeneratorModel: 'gemini-2.5-flash',
  });

  // Modal State for Key Update
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [candidateKey, setCandidateKey] = useState('');
  const [candidateKeyTestResult, setCandidateKeyTestResult] = useState<TestGeminiConnectionResponse | null>(null);
  const [candidateKeyError, setCandidateKeyError] = useState<string | null>(null);

  // Fetch initial telemetry and config
  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [cfg, mdls, summary, feat, mdl, trnds, evts] = await Promise.all([
        geminiAdminApi.getConfiguration(),
        geminiAdminApi.getModels(),
        geminiAdminApi.getUsageSummary(),
        geminiAdminApi.getUsageByFeature(),
        geminiAdminApi.getUsageByModel(),
        geminiAdminApi.getDailyTrends(30),
        geminiAdminApi.getUsageEvents({ limit: eventsLimit, offset: eventsOffset, feature: eventsFeatureFilter || undefined }),
      ]);

      setConfig(cfg);

      const normalizedModels = (mdls || []).map((m: any) => ({
        ...m,
        id: m.model || m.id,
        model: m.model || m.id,
      }));
      setModels(normalizedModels);

      const normalizedSummary: GeminiUsageSummaryResponse = {
        todayRequests: summary?.todayRequests ?? 0,
        monthlyRequests: summary?.monthlyRequests ?? (summary as any)?.monthRequests ?? 0,
        monthRequests: summary?.monthlyRequests ?? (summary as any)?.monthRequests ?? 0,
        totalTokens: summary?.totalTokens ?? 0,
        inputTokens: summary?.inputTokens ?? (summary as any)?.promptTokens ?? 0,
        outputTokens: summary?.outputTokens ?? (summary as any)?.completionTokens ?? 0,
        promptTokens: summary?.inputTokens ?? (summary as any)?.promptTokens ?? 0,
        completionTokens: summary?.outputTokens ?? (summary as any)?.completionTokens ?? 0,
        cachedTokens: summary?.cachedTokens ?? 0,
        estimatedMonthlyCostUsd: summary?.estimatedMonthlyCostUsd ?? (summary as any)?.estimatedCostUsd ?? 0,
        estimatedCostUsd: summary?.estimatedMonthlyCostUsd ?? (summary as any)?.estimatedCostUsd ?? 0,
        estimatedCostInr: (summary as any)?.estimatedCostInr ?? ((summary?.estimatedMonthlyCostUsd ?? (summary as any)?.estimatedCostUsd ?? 0) * 86.5),
        failedRequests: summary?.failedRequests ?? 0,
        avgDurationMs: summary?.avgDurationMs ?? 0,
      };
      setUsageSummary(normalizedSummary);
      setFeatureBreakdown(feat || []);
      setModelBreakdown(mdl || []);
      setTrends(trnds || []);

      const eventList = evts?.items || evts?.events || [];
      setEvents(eventList);
      setEventsTotal(evts?.total ?? eventList.length);

      setModelDraft({
        defaultModel: cfg.defaultModel || 'gemini-2.5-flash',
        coachModel: cfg.featureModels?.aiCoach || cfg.coachModel || cfg.defaultModel || 'gemini-2.5-flash',
        mealPhotoModel: cfg.featureModels?.mealPhotoScanner || cfg.mealPhotoModel || cfg.defaultModel || 'gemini-2.5-flash',
        voiceMealModel: cfg.featureModels?.voiceMealEntry || cfg.voiceMealModel || cfg.defaultModel || 'gemini-2.5-flash',
        workoutGeneratorModel: cfg.featureModels?.workoutGenerator || cfg.workoutGeneratorModel || cfg.defaultModel || 'gemini-2.5-flash',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load Gemini AI configuration';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [toast, eventsLimit, eventsOffset, eventsFeatureFilter]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Fetch only telemetry events when pagination or filter changes
  const fetchEventsOnly = useCallback(async (offset: number, feature: string) => {
    setIsRefreshingEvents(true);
    try {
      const res = await geminiAdminApi.getUsageEvents({
        limit: eventsLimit,
        offset,
        feature: feature || undefined,
      });
      const eventList = res?.items || res?.events || [];
      setEvents(eventList);
      setEventsTotal(res?.total ?? eventList.length);
      setEventsOffset(offset);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to query telemetry events';
      toast.error(message);
    } finally {
      setIsRefreshingEvents(false);
    }
  }, [eventsLimit, toast]);

  // Track if model overrides have unsaved changes
  const isModelDraftDirty = useMemo(() => {
    if (!config) return false;
    const currentCoach = config.featureModels?.aiCoach || config.coachModel;
    const currentMeal = config.featureModels?.mealPhotoScanner || config.mealPhotoModel;
    const currentVoice = config.featureModels?.voiceMealEntry || config.voiceMealModel;
    const currentWorkout = config.featureModels?.workoutGenerator || config.workoutGeneratorModel;

    return (
      modelDraft.defaultModel !== config.defaultModel ||
      modelDraft.coachModel !== currentCoach ||
      modelDraft.mealPhotoModel !== currentMeal ||
      modelDraft.voiceMealModel !== currentVoice ||
      modelDraft.workoutGeneratorModel !== currentWorkout
    );
  }, [config, modelDraft]);

  // Save Model Configurations
  const saveModelDraft = async () => {
    if (!config) return;
    setIsSaving(true);
    try {
      const updated = await geminiAdminApi.updateConfiguration({
        defaultModel: modelDraft.defaultModel,
        featureModels: {
          aiCoach: modelDraft.coachModel,
          mealPhotoScanner: modelDraft.mealPhotoModel,
          voiceMealEntry: modelDraft.voiceMealModel,
          workoutGenerator: modelDraft.workoutGeneratorModel,
        },
        coachModel: modelDraft.coachModel,
        mealPhotoModel: modelDraft.mealPhotoModel,
        voiceMealModel: modelDraft.voiceMealModel,
        workoutGeneratorModel: modelDraft.workoutGeneratorModel,
        expectedVersion: config.version,
      });
      setConfig(updated);
      setModelDraft({
        defaultModel: updated.defaultModel || 'gemini-2.5-flash',
        coachModel: updated.featureModels?.aiCoach || updated.coachModel || updated.defaultModel || 'gemini-2.5-flash',
        mealPhotoModel: updated.featureModels?.mealPhotoScanner || updated.mealPhotoModel || updated.defaultModel || 'gemini-2.5-flash',
        voiceMealModel: updated.featureModels?.voiceMealEntry || updated.voiceMealModel || updated.defaultModel || 'gemini-2.5-flash',
        workoutGeneratorModel: updated.featureModels?.workoutGenerator || updated.workoutGeneratorModel || updated.defaultModel || 'gemini-2.5-flash',
      });
      toast.success('Gemini model configurations updated successfully.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update Gemini models';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  // Test Active Gemini Connection
  const testActiveConnection = async () => {
    setIsTestingActiveKey(true);
    setActiveTestResult(null);
    try {
      const res = await geminiAdminApi.testConnection();
      setActiveTestResult(res);
      if (res.success) {
        toast.success(`Gemini API connection verified (${res.latencyMs}ms)`);
      } else {
        toast.error(`Gemini API test failed: ${res.message}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection test request failed';
      setActiveTestResult({
        success: false,
        latencyMs: 0,
        model: 'unknown',
        message: msg,
        testedAt: new Date().toISOString(),
      });
      toast.error(msg);
    } finally {
      setIsTestingActiveKey(false);
    }
  };

  // Test Candidate Key Inside Modal
  const testCandidateKey = async () => {
    if (!candidateKey.trim()) {
      setCandidateKeyError('Please enter an API key to test');
      return;
    }
    setIsTestingCandidateKey(true);
    setCandidateKeyTestResult(null);
    setCandidateKeyError(null);
    try {
      const res = await geminiAdminApi.testConnection({ apiKey: candidateKey.trim() });
      setCandidateKeyTestResult(res);
      if (res.success) {
        toast.success(`Candidate API key verified (${res.latencyMs}ms)`);
      } else {
        setCandidateKeyError(res.message);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Candidate key validation failed';
      setCandidateKeyError(msg);
    } finally {
      setIsTestingCandidateKey(false);
    }
  };

  // Save and Activate New API Key
  const saveNewApiKey = async () => {
    if (!config) return;
    if (!candidateKey.trim()) {
      setCandidateKeyError('API key cannot be empty');
      return;
    }
    setIsSaving(true);
    try {
      const updated = await geminiAdminApi.updateConfiguration({
        apiKey: candidateKey.trim(),
        expectedVersion: config.version,
      });
      setConfig(updated);
      setIsKeyModalOpen(false);
      setCandidateKey('');
      setCandidateKeyTestResult(null);
      setCandidateKeyError(null);
      toast.success(`New Gemini API key encrypted & activated (${updated.keyMask})`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update Gemini API key';
      setCandidateKeyError(msg);
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  // Rollback Key
  const rollbackKey = async () => {
    if (!config || !config.hasPreviousKey) return;
    if (!confirm(`Are you sure you want to rollback to the previous API key (${config.previousKeyMask})?`)) {
      return;
    }
    setIsRollingBack(true);
    try {
      const updated = await geminiAdminApi.rollbackKey({ expectedVersion: config.version });
      setConfig(updated);
      toast.success(`Rolled back to previous API key (${updated.keyMask})`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to rollback API key';
      toast.error(msg);
    } finally {
      setIsRollingBack(false);
    }
  };

  return {
    config,
    models,
    usageSummary,
    featureBreakdown,
    modelBreakdown,
    trends,
    events,
    eventsTotal,
    eventsLimit,
    eventsOffset,
    eventsFeatureFilter,
    setEventsFeatureFilter,
    isLoading,
    isSaving,
    isTestingActiveKey,
    isTestingCandidateKey,
    isRollingBack,
    isRefreshingEvents,
    activeTestResult,
    modelDraft,
    setModelDraft,
    isModelDraftDirty,
    isKeyModalOpen,
    setIsKeyModalOpen,
    candidateKey,
    setCandidateKey,
    candidateKeyTestResult,
    candidateKeyError,
    setCandidateKeyError,
    saveModelDraft,
    testActiveConnection,
    testCandidateKey,
    saveNewApiKey,
    rollbackKey,
    fetchEventsOnly,
    refreshAll: fetchAll,
  };
}
