'use client';

import React from 'react';
import {
  Sparkles,
  KeyRound,
  RotateCcw,
  Zap,
  Save,
  CheckCircle2,
  AlertTriangle,
  Bot,
  Camera,
  Mic,
  Dumbbell,
  Layers,
  Cpu,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type {
  GeminiConfigResponse,
  GeminiModelInfo,
  TestGeminiConnectionResponse,
} from '../types-ai';

interface GeminiConfigSectionProps {
  config: GeminiConfigResponse | null;
  models: GeminiModelInfo[];
  modelDraft: {
    defaultModel: string;
    coachModel: string;
    mealPhotoModel: string;
    voiceMealModel: string;
    workoutGeneratorModel: string;
  };
  setModelDraft: React.Dispatch<
    React.SetStateAction<{
      defaultModel: string;
      coachModel: string;
      mealPhotoModel: string;
      voiceMealModel: string;
      workoutGeneratorModel: string;
    }>
  >;
  isModelDraftDirty: boolean;
  isSaving: boolean;
  isTesting: boolean;
  isRollingBack: boolean;
  activeTestResult: TestGeminiConnectionResponse | null;
  onTestConnection: () => void;
  onOpenKeyModal: () => void;
  onRollbackKey: () => void;
  onSaveModels: () => void;
}

export function GeminiConfigSection({
  config,
  models,
  modelDraft,
  setModelDraft,
  isModelDraftDirty,
  isSaving,
  isTesting,
  isRollingBack,
  activeTestResult,
  onTestConnection,
  onOpenKeyModal,
  onRollbackKey,
  onSaveModels,
}: GeminiConfigSectionProps) {
  if (!config) {
    return (
      <div className="card flex h-48 items-center justify-center">
        <LoadingSpinner size="md" label="Loading Gemini configuration…" />
      </div>
    );
  }

  const isDatabaseKey = config.source === 'database' || (config.isConfigured && !config.keyMask?.includes('ENV'));
  const isEnvFallback = config.source === 'environment' || (config.isConfigured && Boolean(config.keyMask?.includes('ENV')));

  return (
    <div className="space-y-6">
      {/* 1. Secure Gemini API Key Governance Card */}
      <div className="card space-y-4 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ink-850 text-ink-300 ring-1 ring-ink-800">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-white">Google Gemini API Key Management</h4>
                {isDatabaseKey && <Badge variant="completed" size="sm">AES-256-GCM Encrypted</Badge>}
                {isEnvFallback && <Badge variant="warning" size="sm">Environment Fallback</Badge>}
                {!isDatabaseKey && !isEnvFallback && <Badge variant="disabled" size="sm">Not Configured</Badge>}
              </div>
              <p className="text-xs text-ink-400">
                Encrypted in PostgreSQL with separate master key. Secure zero-leakage proxy to Google Gemini.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onTestConnection}
              disabled={isTesting}
              className="btn btn-secondary btn-sm"
            >
              {isTesting ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Pinging Gemini...</span>
                </>
              ) : (
                <>
                  <Zap className="h-3.5 w-3.5 text-amber-400" />
                  <span>Test Connection</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onOpenKeyModal}
              className="btn btn-primary btn-sm"
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>Rotate API Key</span>
            </button>
          </div>
        </div>

        {/* Key Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          <div className="card-inset space-y-1 p-3">
            <span className="eyebrow">Active API Key</span>
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold text-white">
                {config.keyMask ?? (isEnvFallback ? 'Configured via Environment' : 'None')}
              </span>
              <span className="text-[11px] text-ink-500">
                Source: {config.source}
              </span>
            </div>
          </div>

          <div className="card-inset space-y-1 p-3">
            <div className="flex items-center justify-between">
              <span className="eyebrow">Previous Key Archive</span>
              {config.hasPreviousKey && (
                <button
                  type="button"
                  onClick={onRollbackKey}
                  disabled={isRollingBack}
                  className="flex items-center gap-1 text-[11px] font-medium text-brand-400 hover:text-brand-300 disabled:opacity-50"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Rollback</span>
                </button>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-ink-300">
                {config.previousKeyMask ?? 'No previous key stored'}
              </span>
              <span className="text-[11px] text-ink-500">
                {config.hasPreviousKey ? 'Rollback ready' : 'Empty'}
              </span>
            </div>
          </div>

          <div className="card-inset space-y-1 p-3">
            <span className="eyebrow">Audit Metadata</span>
            <div className="flex items-center justify-between text-xs text-ink-300">
              <span>Version: <strong className="text-white">{config.version}</strong></span>
              <span className="text-[11px] text-ink-500">
                Updated: {new Date(config.updatedAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        {/* Live Test Connection Result Banner */}
        {activeTestResult && (
          <div
            className={`rounded-lg border p-3 text-xs flex items-center justify-between ${
              activeTestResult.success
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {activeTestResult.success ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
              )}
              <span>
                {activeTestResult.message} (Tested with model: <code className="font-mono font-bold">{activeTestResult.model}</code>)
              </span>
            </div>
            <span className="font-mono text-xs font-semibold">
              Latency: {activeTestResult.latencyMs}ms
            </span>
          </div>
        )}
      </div>

      {/* 2. Dynamic Model Configuration & Per-Feature Overrides Card */}
      <div className="card space-y-5 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ink-850 text-ink-300 ring-1 ring-ink-800">
              <Cpu className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-white">Dynamic Gemini Model Configuration</h4>
                {isModelDraftDirty && <Badge variant="warning" size="sm">Unsaved Overrides</Badge>}
              </div>
              <p className="text-xs text-ink-400">
                Configure runtime models per feature without mobile app updates or server redeployment.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onSaveModels}
            disabled={!isModelDraftDirty || isSaving}
            className="btn btn-primary btn-sm"
          >
            {isSaving ? (
              <>
                <LoadingSpinner size="sm" />
                <span>Saving Models...</span>
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" />
                <span>Save Model Settings</span>
              </>
            )}
          </button>
        </div>

        {/* Global Default Model Selection */}
        <div className="card-inset space-y-2 p-4">
          <label className="text-xs font-semibold text-ink-300 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-brand-400" />
              Default System AI Model
            </span>
            <span className="text-[11px] text-ink-500">Fallback for all AI operations</span>
          </label>
          <select
            value={modelDraft.defaultModel}
            onChange={(e) =>
              setModelDraft((prev) => ({ ...prev, defaultModel: e.target.value }))
            }
            className="input"
          >
            {models.map((m, idx) => {
              const modelKey = m.model || m.id || `model-${idx}`;
              return (
                <option key={`default-${modelKey}`} value={modelKey}>
                  {m.displayName} ({modelKey}) — Input: ${m.inputPricePerMillion}/M, Output: ${m.outputPricePerMillion}/M
                  {(m.isRecommendedDefault || m.isDefault) ? ' [Recommended]' : ''}
                </option>
              );
            })}
          </select>
        </div>

        {/* Per-Feature Overrides Grid */}
        <div className="space-y-3">
          <h5 className="eyebrow">
            Per-Feature Model Overrides
          </h5>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* AI Coach */}
            <div className="card-inset space-y-2 p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-medium text-ink-200">
                  <Bot className="h-4 w-4 text-emerald-400" />
                  <span>AI Coach Chat</span>
                </div>
                <Badge variant="completed" size="sm">Conversational</Badge>
              </div>
              <p className="text-[11px] text-ink-500">
                Fitness guidance, memory retrieval, and workout recommendation chat.
              </p>
              <select
                value={modelDraft.coachModel}
                onChange={(e) =>
                  setModelDraft((prev) => ({ ...prev, coachModel: e.target.value }))
                }
                className="input"
              >
                {models.map((m, idx) => {
                  const modelKey = m.model || m.id || `coach-${idx}`;
                  return (
                    <option key={`coach-${modelKey}`} value={modelKey}>
                      {m.displayName}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Meal Photo Scanner */}
            <div className="card-inset space-y-2 p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-medium text-ink-200">
                  <Camera className="h-4 w-4 text-purple-400" />
                  <span>Meal Photo Scanner</span>
                </div>
                <Badge variant="info" size="sm">Vision Capable</Badge>
              </div>
              <p className="text-[11px] text-ink-500">
                Nutritional image analysis, portion sizing, and macronutrient estimation.
              </p>
              <select
                value={modelDraft.mealPhotoModel}
                onChange={(e) =>
                  setModelDraft((prev) => ({ ...prev, mealPhotoModel: e.target.value }))
                }
                className="input"
              >
                {models
                  .filter((m) => m.capabilities?.vision ?? m.supportsVision ?? true)
                  .map((m, idx) => {
                    const modelKey = m.model || m.id || `meal-${idx}`;
                    return (
                      <option key={`meal-${modelKey}`} value={modelKey}>
                        {m.displayName} (Vision)
                      </option>
                    );
                  })}
              </select>
            </div>

            {/* Voice Meal Entry */}
            <div className="card-inset space-y-2 p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-medium text-ink-200">
                  <Mic className="h-4 w-4 text-amber-400" />
                  <span>Voice Meal Entry</span>
                </div>
                <Badge variant="warning" size="sm">Audio Capable</Badge>
              </div>
              <p className="text-[11px] text-ink-500">
                Audio voice recording parsing into structured dietary logs.
              </p>
              <select
                value={modelDraft.voiceMealModel}
                onChange={(e) =>
                  setModelDraft((prev) => ({ ...prev, voiceMealModel: e.target.value }))
                }
                className="input"
              >
                {models
                  .filter((m) => m.capabilities?.audio ?? m.supportsAudio ?? true)
                  .map((m, idx) => {
                    const modelKey = m.model || m.id || `voice-${idx}`;
                    return (
                      <option key={`voice-${modelKey}`} value={modelKey}>
                        {m.displayName} (Audio)
                      </option>
                    );
                  })}
              </select>
            </div>

            {/* Workout Generator */}
            <div className="card-inset space-y-2 p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-medium text-ink-200">
                  <Dumbbell className="h-4 w-4 text-rose-400" />
                  <span>Workout Generator</span>
                </div>
                <Badge variant="completed" size="sm">Structured JSON</Badge>
              </div>
              <p className="text-[11px] text-ink-500">
                Custom workout routine generation, sets, reps, and target muscle mapping.
              </p>
              <select
                value={modelDraft.workoutGeneratorModel}
                onChange={(e) =>
                  setModelDraft((prev) => ({ ...prev, workoutGeneratorModel: e.target.value }))
                }
                className="input"
              >
                {models.map((m, idx) => {
                  const modelKey = m.model || m.id || `workout-${idx}`;
                  return (
                    <option key={`workout-${modelKey}`} value={modelKey}>
                      {m.displayName}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
