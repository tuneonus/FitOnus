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
      <div className="flex h-48 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/50">
        <LoadingSpinner size="md" label="Loading Gemini configuration..." />
      </div>
    );
  }

  const isDatabaseKey = config.source === 'database';
  const isEnvFallback = config.source === 'environment';

  return (
    <div className="space-y-6">
      {/* 1. Secure Gemini API Key Governance Card */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-white">Google Gemini API Key Management</h4>
                {isDatabaseKey && <Badge variant="completed" size="sm">AES-256-GCM Encrypted</Badge>}
                {isEnvFallback && <Badge variant="warning" size="sm">Environment Fallback</Badge>}
                {!isDatabaseKey && !isEnvFallback && <Badge variant="disabled" size="sm">Not Configured</Badge>}
              </div>
              <p className="text-xs text-slate-400">
                Encrypted in PostgreSQL with separate master key. Secure zero-leakage proxy to Google Gemini.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onTestConnection}
              disabled={isTesting}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50 transition"
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
              className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-500 transition"
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>Rotate API Key</span>
            </button>
          </div>
        </div>

        {/* Key Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-1">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Active API Key</span>
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold text-white">
                {config.keyMask ?? (isEnvFallback ? 'Configured via Environment' : 'None')}
              </span>
              <span className="text-[10px] text-slate-500">
                Source: {config.source}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Previous Key Archive</span>
              {config.hasPreviousKey && (
                <button
                  type="button"
                  onClick={onRollbackKey}
                  disabled={isRollingBack}
                  className="flex items-center gap-1 text-[11px] font-medium text-teal-400 hover:text-teal-300 disabled:opacity-50"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Rollback</span>
                </button>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-slate-300">
                {config.previousKeyMask ?? 'No previous key stored'}
              </span>
              <span className="text-[10px] text-slate-500">
                {config.hasPreviousKey ? 'Rollback ready' : 'Empty'}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-1">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Audit Metadata</span>
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>Version: <strong className="text-white">{config.version}</strong></span>
              <span className="text-[10px] text-slate-500">
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
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-white">Dynamic Gemini Model Configuration</h4>
                {isModelDraftDirty && <Badge variant="warning" size="sm">Unsaved Overrides</Badge>}
              </div>
              <p className="text-xs text-slate-400">
                Configure runtime models per feature without mobile app updates or server redeployment.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onSaveModels}
            disabled={!isModelDraftDirty || isSaving}
            className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-500 disabled:opacity-50 transition"
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
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 space-y-2">
          <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-teal-400" />
              Default System AI Model
            </span>
            <span className="text-[10px] text-slate-500">Fallback for all AI operations</span>
          </label>
          <select
            value={modelDraft.defaultModel}
            onChange={(e) =>
              setModelDraft((prev) => ({ ...prev, defaultModel: e.target.value }))
            }
            className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-medium text-white focus:border-teal-500 focus:outline-none"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName} ({m.id}) — Input: ${m.inputPricePerMillion}/M, Output: ${m.outputPricePerMillion}/M
                {m.isRecommendedDefault ? ' [Recommended]' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Per-Feature Overrides Grid */}
        <div className="space-y-3">
          <h5 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Per-Feature Model Overrides
          </h5>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* AI Coach */}
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
                  <Bot className="h-4 w-4 text-emerald-400" />
                  <span>AI Coach Chat</span>
                </div>
                <Badge variant="completed" size="sm">Conversational</Badge>
              </div>
              <p className="text-[11px] text-slate-500">
                Fitness guidance, memory retrieval, and workout recommendation chat.
              </p>
              <select
                value={modelDraft.coachModel}
                onChange={(e) =>
                  setModelDraft((prev) => ({ ...prev, coachModel: e.target.value }))
                }
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-teal-500 focus:outline-none"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </div>

            {/* Meal Photo Scanner */}
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
                  <Camera className="h-4 w-4 text-purple-400" />
                  <span>Meal Photo Scanner</span>
                </div>
                <Badge variant="info" size="sm">Vision Capable</Badge>
              </div>
              <p className="text-[11px] text-slate-500">
                Nutritional image analysis, portion sizing, and macronutrient estimation.
              </p>
              <select
                value={modelDraft.mealPhotoModel}
                onChange={(e) =>
                  setModelDraft((prev) => ({ ...prev, mealPhotoModel: e.target.value }))
                }
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-teal-500 focus:outline-none"
              >
                {models
                  .filter((m) => m.supportsVision)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName} (Vision)
                    </option>
                  ))}
              </select>
            </div>

            {/* Voice Meal Entry */}
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
                  <Mic className="h-4 w-4 text-amber-400" />
                  <span>Voice Meal Entry</span>
                </div>
                <Badge variant="warning" size="sm">Audio Capable</Badge>
              </div>
              <p className="text-[11px] text-slate-500">
                Audio voice recording parsing into structured dietary logs.
              </p>
              <select
                value={modelDraft.voiceMealModel}
                onChange={(e) =>
                  setModelDraft((prev) => ({ ...prev, voiceMealModel: e.target.value }))
                }
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-teal-500 focus:outline-none"
              >
                {models
                  .filter((m) => m.supportsAudio)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName} (Audio)
                    </option>
                  ))}
              </select>
            </div>

            {/* Workout Generator */}
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
                  <Dumbbell className="h-4 w-4 text-rose-400" />
                  <span>Workout Generator</span>
                </div>
                <Badge variant="completed" size="sm">Structured JSON</Badge>
              </div>
              <p className="text-[11px] text-slate-500">
                Custom workout routine generation, sets, reps, and target muscle mapping.
              </p>
              <select
                value={modelDraft.workoutGeneratorModel}
                onChange={(e) =>
                  setModelDraft((prev) => ({ ...prev, workoutGeneratorModel: e.target.value }))
                }
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-teal-500 focus:outline-none"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
