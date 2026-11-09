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
      setModels(mdls);
      setUsageSummary(summary);
      setFeatureBreakdown(feat);
      setModelBreakdown(mdl);
      setTrends(trnds);
      setEvents(evts.events);
      setEventsTotal(evts.total);

      setModelDraft({
        defaultModel: cfg.defaultModel,
        coachModel: cfg.coachModel,
        mealPhotoModel: cfg.mealPhotoModel,
        voiceMealModel: cfg.voiceMealModel,
        workoutGeneratorModel: cfg.workoutGeneratorModel,
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
      setEvents(res.events);
      setEventsTotal(res.total);
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
    return (
      modelDraft.defaultModel !== config.defaultModel ||
      modelDraft.coachModel !== config.coachModel ||
      modelDraft.mealPhotoModel !== config.mealPhotoModel ||
      modelDraft.voiceMealModel !== config.voiceMealModel ||
      modelDraft.workoutGeneratorModel !== config.workoutGeneratorModel
    );
  }, [config, modelDraft]);

  // Save Model Configurations
  const saveModelDraft = async () => {
    if (!config) return;
    setIsSaving(true);
    try {
      const updated = await geminiAdminApi.updateConfiguration({
        defaultModel: modelDraft.defaultModel,
        coachModel: modelDraft.coachModel,
        mealPhotoModel: modelDraft.mealPhotoModel,
        voiceMealModel: modelDraft.voiceMealModel,
        workoutGeneratorModel: modelDraft.workoutGeneratorModel,
        expectedVersion: config.version,
      });
      setConfig(updated);
      setModelDraft({
        defaultModel: updated.defaultModel,
        coachModel: updated.coachModel,
        mealPhotoModel: updated.mealPhotoModel,
        voiceMealModel: updated.voiceMealModel,
        workoutGeneratorModel: updated.workoutGeneratorModel,
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
