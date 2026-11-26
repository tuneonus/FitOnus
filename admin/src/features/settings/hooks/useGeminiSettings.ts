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
  const [eventsLimit] = useState(15);
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
    defaultModel: 'gemini-3.5-flash-lite',
    fallbackModel: 'gemini-3.1-flash-lite',
    coachModel: 'gemini-3.5-flash-lite',
    mealPhotoModel: 'gemini-3.5-flash-lite',
    voiceMealModel: 'gemini-3.5-flash-lite',
    workoutGeneratorModel: 'gemini-3.5-flash-lite',
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

      const normalizedModels: GeminiModelInfo[] = (mdls || []).map((m: GeminiModelInfo) => ({
        ...m,
        id: m.model || m.id || '',
        model: m.model || m.id || '',
      }));
      setModels(normalizedModels);

      const monthlyCost = summary?.estimatedMonthlyCostUsd ?? summary?.estimatedCostUsd ?? 0;
      const monthlyReqs = summary?.monthlyRequests ?? summary?.monthRequests ?? 0;
      const inTokens = summary?.inputTokens ?? summary?.promptTokens ?? 0;
      const outTokens = summary?.outputTokens ?? summary?.completionTokens ?? 0;

      const normalizedSummary: GeminiUsageSummaryResponse = {
        todayRequests: summary?.todayRequests ?? 0,
        monthlyRequests: monthlyReqs,
        monthRequests: monthlyReqs,
        totalTokens: summary?.totalTokens ?? 0,
        inputTokens: inTokens,
        outputTokens: outTokens,
        promptTokens: inTokens,
        completionTokens: outTokens,
        cachedTokens: summary?.cachedTokens ?? 0,
        estimatedMonthlyCostUsd: monthlyCost,
        estimatedCostUsd: monthlyCost,
        estimatedCostInr: summary?.estimatedCostInr ?? monthlyCost * 86.5,
        failedRequests: summary?.failedRequests ?? 0,
        avgDurationMs: summary?.avgDurationMs ?? 0,
        fallbackCount: summary?.fallbackCount ?? 0,
        rateLimitedCount: summary?.rateLimitedCount ?? 0,
        cooldownStatus: summary?.cooldownStatus ?? [],
      };
      setUsageSummary(normalizedSummary);
      setFeatureBreakdown(feat || []);
      setModelBreakdown(mdl || []);
      setTrends(trnds || []);

      const eventList = evts?.items || evts?.events || [];
      setEvents(eventList);
      setEventsTotal(evts?.total ?? eventList.length);

      setModelDraft({
        defaultModel: cfg.defaultModel || 'gemini-3.5-flash-lite',
        fallbackModel: cfg.fallbackModel || 'gemini-3.1-flash-lite',
        coachModel: cfg.featureModels?.aiCoach || cfg.coachModel || cfg.defaultModel || 'gemini-3.5-flash-lite',
        mealPhotoModel: cfg.featureModels?.mealPhotoScanner || cfg.mealPhotoModel || cfg.defaultModel || 'gemini-3.5-flash-lite',
        voiceMealModel: cfg.featureModels?.voiceMealEntry || cfg.voiceMealModel || cfg.defaultModel || 'gemini-3.5-flash-lite',
        workoutGeneratorModel: cfg.featureModels?.workoutGenerator || cfg.workoutGeneratorModel || cfg.defaultModel || 'gemini-3.5-flash-lite',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load Gemini AI configuration';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [toast, eventsLimit, eventsOffset, eventsFeatureFilter]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) return fetchAll();
      return undefined;
    });
    return () => {
      active = false;
    };
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
      toast.fromError(err, 'Failed to query telemetry events');
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
      modelDraft.fallbackModel !== (config.fallbackModel || 'gemini-3.1-flash-lite') ||
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
        fallbackModel: modelDraft.fallbackModel,
        featureModels: {
          aiCoach: modelDraft.coachModel,
          mealPhotoScanner: modelDraft.mealPhotoModel,
          voiceMealEntry: modelDraft.voiceMealModel,
          workoutGenerator: modelDraft.workoutGeneratorModel,
        },
        expectedVersion: config.version,
      });
      setConfig(updated);
      setModelDraft({
        defaultModel: updated.defaultModel || 'gemini-3.5-flash-lite',
        fallbackModel: updated.fallbackModel || 'gemini-3.1-flash-lite',
        coachModel: updated.featureModels?.aiCoach || updated.coachModel || updated.defaultModel || 'gemini-3.5-flash-lite',
        mealPhotoModel: updated.featureModels?.mealPhotoScanner || updated.mealPhotoModel || updated.defaultModel || 'gemini-3.5-flash-lite',
        voiceMealModel: updated.featureModels?.voiceMealEntry || updated.voiceMealModel || updated.defaultModel || 'gemini-3.5-flash-lite',
        workoutGeneratorModel: updated.featureModels?.workoutGenerator || updated.workoutGeneratorModel || updated.defaultModel || 'gemini-3.5-flash-lite',
      });
      toast.success('Gemini model configurations updated successfully.');
    } catch (err: unknown) {
      toast.fromError(err, 'Failed to update Gemini models');
    } finally {
      setIsSaving(false);
    }
  };

  // Test Active Gemini Connection
  const testActiveConnection = async () => {
    setIsTestingActiveKey(true);
    setActiveTestResult(null);
    try {
      const res = await geminiAdminApi.testConnection({ model: modelDraft.defaultModel });
      const normalizedResult: TestGeminiConnectionResponse = {
        ...res,
        model: res.model || res.modelUsed || modelDraft.defaultModel,
        message:
          res.message ||
          res.error ||
          (res.success ? 'Gemini API connection verified' : 'Gemini API connection test failed'),
        latencyMs: res.latencyMs ?? 0,
        testedAt: new Date().toISOString(),
      };
      setActiveTestResult(normalizedResult);
      if (normalizedResult.success) {
        toast.success(`Gemini API connection verified (${normalizedResult.latencyMs}ms)`);
      } else {
        toast.warning(`Gemini API test failed: ${normalizedResult.message}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection test request failed';
      setActiveTestResult({
        success: false,
        latencyMs: 0,
        model: modelDraft.defaultModel,
        keySource: 'unavailable',
        message: msg,
        testedAt: new Date().toISOString(),
      });
      toast.fromError(err, 'Connection test request failed');
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
      const res = await geminiAdminApi.testConnection({
        apiKey: candidateKey.trim(),
        model: modelDraft.defaultModel,
      });
      const normalizedResult: TestGeminiConnectionResponse = {
        ...res,
        model: res.model || res.modelUsed || modelDraft.defaultModel,
        message:
          res.message ||
          res.error ||
          (res.success ? 'Candidate API key verified' : 'Candidate API key validation failed'),
        latencyMs: res.latencyMs ?? 0,
        testedAt: new Date().toISOString(),
      };
      setCandidateKeyTestResult(normalizedResult);
      if (normalizedResult.success) {
        toast.success(`Candidate API key verified (${normalizedResult.latencyMs}ms)`);
      } else {
        setCandidateKeyError(normalizedResult.message);
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
      // Inline error banner in modal handles this; do not show duplicate toast
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
      toast.fromError(err, 'Failed to rollback API key');
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
