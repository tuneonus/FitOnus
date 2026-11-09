'use client';

import React, { useState } from 'react';
import {
  Sliders,
  Smartphone,
  ShieldAlert,
  Sparkles,
  Bot,
  Camera,
  Mic,
  Dumbbell,
  Mail,
  FileText,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Save,
  RotateCcw,
  ExternalLink,
  Activity,
  Users,
  Gauge,
} from 'lucide-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { StatsCard } from '@/components/ui/StatsCard';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAppSettings } from '../hooks/useAppSettings';
import { GeminiConfigSection } from './GeminiConfigSection';
import { GeminiAnalyticsSection } from './GeminiAnalyticsSection';
import { GeminiKeyModal } from './GeminiKeyModal';
import { useGeminiSettings } from '../hooks/useGeminiSettings';

type SettingsTab = 'all' | 'app' | 'features' | 'ai';

export function AppSettingsView() {
  const {
    isLoading,
    isSaving,
    isRefreshing,
    error,
    records,
    aiUsageStats,
    isDirty,
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
    isMaintenanceDirty,
    isMinVersionDirty,
    isForceUpdateDirty,
    isSupportDirty,
    isLegalDirty,
    isFeaturesDirty,
    isAiLimitsDirty,
    saveSettings,
    resetDraft,
    refresh,
  } = useAppSettings();

  const [activeTab, setActiveTab] = useState<SettingsTab>('all');
  const [aiSubTab, setAiSubTab] = useState<'config' | 'analytics' | 'limits'>('config');
  const gemini = useGeminiSettings();

  const handleRefresh = async () => {
    await Promise.all([refresh(), gemini.refreshAll()]);
  };

  if (isLoading || gemini.isLoading) {
    return (
      <AdminLayout title="Application Settings" subtitle="Remote configuration and limits">
        <div className="flex h-96 items-center justify-center">
          <LoadingSpinner size="lg" label="Loading application settings from Neon DEV..." />
        </div>
      </AdminLayout>
    );
  }

  const isMaintenanceActive = maintenanceDraft.enabled;

  return (
    <AdminLayout
      title="Application Settings"
      subtitle="Remote configuration, feature flags, and AI quota governance"
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing || gemini.isRefreshingEvents}
    >
      <div className="space-y-6 pb-12">
        {/* Maintenance Mode Alert Banner if active */}
        {isMaintenanceActive && (
          <div className="flex items-center justify-between rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-300">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-5 w-5 shrink-0 text-amber-400" />
              <div>
                <p className="font-semibold text-sm">Maintenance Mode is Currently Enabled</p>
                <p className="text-xs text-amber-400/80">
                  Mobile applications will display the maintenance overlay. Admin operations remain fully accessible.
                </p>
              </div>
            </div>
            <Badge variant="warning">Maintenance Live</Badge>
          </div>
        )}

        {/* Global Action Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white">Central Configuration Store</h2>
                <Badge variant="completed" size="sm">Neon PostgreSQL DEV</Badge>
                {isDirty && <Badge variant="warning" size="sm">Unsaved Changes</Badge>}
              </div>
              <p className="text-xs text-slate-400">
                Optimistic concurrency enabled. Changes apply immediately to public configuration cache.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={resetDraft}
              disabled={!isDirty || isSaving}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Discard
            </button>

            <button
              type="button"
              onClick={() => saveSettings()}
              disabled={!isDirty || isSaving}
              className="flex items-center gap-1.5 rounded-lg bg-teal-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-teal-400 transition-all shadow-md shadow-teal-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Saving to DEV...
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>

        {/* Tab Filters */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('all')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'all'
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Sections
          </button>
          <button
            onClick={() => setActiveTab('app')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'app'
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            App Management
            {(isMaintenanceDirty || isMinVersionDirty || isForceUpdateDirty || isSupportDirty || isLegalDirty) && (
              <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('features')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'features'
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Feature Management
            {isFeaturesDirty && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />}
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'ai'
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            AI Management & Quotas
            {isAiLimitsDirty && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />}
          </button>
        </div>

        {/* ========================================================= */}
        {/* SECTION A: APP MANAGEMENT                                 */}
        {/* ========================================================= */}
        {(activeTab === 'all' || activeTab === 'app') && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                  Section A — App Management
                </h3>
                <p className="text-xs text-slate-500">
                  System availability, minimum version enforcement, and public support channels.
                </p>
              </div>
            </div>

            {/* Maintenance Mode Card */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    <ShieldAlert className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">Maintenance Mode</h4>
                    <p className="text-xs text-slate-400">
                      Instantly pause mobile member access for server updates or migrations.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">
                    Version: {records['app.maintenance']?.version ?? 1}
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={maintenanceDraft.enabled}
                      onChange={(e) =>
                        setMaintenanceDraft((prev) => ({ ...prev, enabled: e.target.checked }))
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-medium text-slate-300">
                    Maintenance Announcement Message
                  </label>
                  <textarea
                    rows={2}
                    value={maintenanceDraft.message}
                    onChange={(e) =>
                      setMaintenanceDraft((prev) => ({ ...prev, message: e.target.value }))
                    }
                    placeholder="FitOnus is currently undergoing scheduled maintenance..."
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-teal-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">
                    Expected Completion Time (Optional ISO / Datetime)
                  </label>
                  <input
                    type="text"
                    value={maintenanceDraft.expectedEndTime || ''}
                    onChange={(e) =>
                      setMaintenanceDraft((prev) => ({
                        ...prev,
                        expectedEndTime: e.target.value.trim() ? e.target.value : null,
                      }))
                    }
                    placeholder="2026-11-09T12:00:00Z"
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-teal-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Version & Force Update Card */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-400">
                    <Smartphone className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">App Version & Force Update</h4>
                    <p className="text-xs text-slate-400">
                      Enforce minimum app client version requirements and store redirects.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">
                    Version: {records['app.force_update']?.version ?? 1}
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={forceUpdateDraft.enabled}
                      onChange={(e) =>
                        setForceUpdateDraft((prev) => ({ ...prev, enabled: e.target.checked }))
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-500"></div>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">
                    Android Minimum Supported Version (Semver)
                  </label>
                  <input
                    type="text"
                    value={minVersionDraft.androidMinVersion}
                    onChange={(e) =>
                      setMinVersionDraft({ androidMinVersion: e.target.value.trim() })
                    }
                    placeholder="1.0.0"
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-teal-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-500">
                    Apps below this version are blocked when Force Update is active.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">
                    Google Play Store URL
                  </label>
                  <input
                    type="url"
                    value={forceUpdateDraft.storeUrl}
                    onChange={(e) =>
                      setForceUpdateDraft((prev) => ({ ...prev, storeUrl: e.target.value }))
                    }
                    placeholder="https://play.google.com/store/apps/details?id=com.fitonus.app"
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-teal-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-medium text-slate-300">
                    Force Update Prompt Message
                  </label>
                  <textarea
                    rows={2}
                    value={forceUpdateDraft.updateMessage}
                    onChange={(e) =>
                      setForceUpdateDraft((prev) => ({ ...prev, updateMessage: e.target.value }))
                    }
                    placeholder="A critical update is required to continue using FitOnus..."
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-teal-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Support & Legal Card */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                  <Mail className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Support & Legal Information</h4>
                  <p className="text-xs text-slate-400">
                    Public contact details and legal compliance endpoints.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Support Email</label>
                  <input
                    type="email"
                    value={supportDraft.email}
                    onChange={(e) =>
                      setSupportDraft((prev) => ({ ...prev, email: e.target.value.trim() }))
                    }
                    placeholder="support@fitonus.com"
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-teal-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Support Website</label>
                  <input
                    type="url"
                    value={supportDraft.website}
                    onChange={(e) =>
                      setSupportDraft((prev) => ({ ...prev, website: e.target.value.trim() }))
                    }
                    placeholder="https://fitonus.com/support"
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-teal-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Contact Info / Hotline</label>
                  <input
                    type="text"
                    value={supportDraft.contactInfo}
                    onChange={(e) =>
                      setSupportDraft((prev) => ({ ...prev, contactInfo: e.target.value }))
                    }
                    placeholder="+1 (800) 555-ONUS"
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-teal-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-1.5">
                  <label className="text-xs font-medium text-slate-300">Privacy Policy URL</label>
                  <input
                    type="url"
                    value={legalDraft.privacyPolicyUrl}
                    onChange={(e) =>
                      setLegalDraft((prev) => ({ ...prev, privacyPolicyUrl: e.target.value.trim() }))
                    }
                    placeholder="https://fitonus.com/privacy"
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-teal-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-1.5">
                  <label className="text-xs font-medium text-slate-300">Terms of Service URL</label>
                  <input
                    type="url"
                    value={legalDraft.termsOfServiceUrl}
                    onChange={(e) =>
                      setLegalDraft((prev) => ({ ...prev, termsOfServiceUrl: e.target.value.trim() }))
                    }
                    placeholder="https://fitonus.com/terms"
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-teal-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SECTION B: FEATURE MANAGEMENT                             */}
        {/* ========================================================= */}
        {(activeTab === 'all' || activeTab === 'features') && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                  Section B — Feature Management (Remote Feature Flags)
                </h3>
                <p className="text-xs text-slate-500">
                  Enable or disable application modules in real time. Backend enforces permissions and preserves all user records.
                </p>
              </div>
              <Badge variant={records['features.flags'] ? 'completed' : 'neutral'} size="sm">
                v{records['features.flags']?.version ?? 1}
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Feature 1: AI Coach */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-400">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">AI Coach Conversation</h4>
                      <p className="text-xs text-slate-400">Chat and workout advisory assistant</p>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={featuresDraft.aiCoach}
                      onChange={(e) =>
                        setFeaturesDraft((prev) => ({ ...prev, aiCoach: e.target.checked }))
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-500"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-800/80 pt-2">
                  <span>Status:</span>
                  <Badge variant={featuresDraft.aiCoach ? 'active' : 'disabled'} size="sm">
                    {featuresDraft.aiCoach ? 'Active on Mobile' : 'Disabled / Gated'}
                  </Badge>
                </div>
              </div>

              {/* Feature 2: Meal Photo Scanner */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                      <Camera className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">AI Meal Photo Scanner</h4>
                      <p className="text-xs text-slate-400">Multimodal Gemini vision meal analysis</p>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={featuresDraft.mealPhotoScanner}
                      onChange={(e) =>
                        setFeaturesDraft((prev) => ({
                          ...prev,
                          mealPhotoScanner: e.target.checked,
                        }))
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-800/80 pt-2">
                  <span>Status:</span>
                  <Badge variant={featuresDraft.mealPhotoScanner ? 'active' : 'disabled'} size="sm">
                    {featuresDraft.mealPhotoScanner ? 'Active on Mobile' : 'Disabled / Gated'}
                  </Badge>
                </div>
              </div>

              {/* Feature 3: Voice Meal Entry */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
                      <Mic className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">Voice Meal Entry</h4>
                      <p className="text-xs text-slate-400">Natural voice to nutrition intake parser</p>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={featuresDraft.voiceMealEntry}
                      onChange={(e) =>
                        setFeaturesDraft((prev) => ({
                          ...prev,
                          voiceMealEntry: e.target.checked,
                        }))
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-800/80 pt-2">
                  <span>Status:</span>
                  <Badge variant={featuresDraft.voiceMealEntry ? 'active' : 'disabled'} size="sm">
                    {featuresDraft.voiceMealEntry ? 'Active on Mobile' : 'Disabled / Gated'}
                  </Badge>
                </div>
              </div>

              {/* Feature 4: Workout Generator */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                      <Dumbbell className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">Workout Generator</h4>
                      <p className="text-xs text-slate-400">Automated custom fitness plan generation</p>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={featuresDraft.workoutGenerator}
                      onChange={(e) =>
                        setFeaturesDraft((prev) => ({
                          ...prev,
                          workoutGenerator: e.target.checked,
                        }))
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-800/80 pt-2">
                  <span>Status:</span>
                  <Badge variant={featuresDraft.workoutGenerator ? 'active' : 'disabled'} size="sm">
                    {featuresDraft.workoutGenerator ? 'Active on Mobile' : 'Disabled / Gated'}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SECTION C: AI MANAGEMENT & REAL USAGE ANALYTICS           */}
        {/* ========================================================= */}
        {(activeTab === 'all' || activeTab === 'ai') && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                  Section C — AI Management & Live Analytics
                </h3>
                <p className="text-xs text-slate-500">
                  Secure Gemini API key management, dynamic per-feature model selection, and token usage analytics.
                </p>
              </div>

              {/* Sub-Navigation when filtered to AI */}
              {activeTab === 'ai' && (
                <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/80 p-1">
                  <button
                    type="button"
                    onClick={() => setAiSubTab('config')}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                      aiSubTab === 'config'
                        ? 'bg-teal-500 text-slate-950 font-semibold shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Gemini Configuration
                    {gemini.isModelDraftDirty && (
                      <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiSubTab('analytics')}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                      aiSubTab === 'analytics'
                        ? 'bg-teal-500 text-slate-950 font-semibold shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Usage & Cost Analytics
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiSubTab('limits')}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                      aiSubTab === 'limits'
                        ? 'bg-teal-500 text-slate-950 font-semibold shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    User Quotas & Limits
                    {isAiLimitsDirty && (
                      <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* 1. Secure Gemini API Key & Model Configuration */}
            {(activeTab === 'all' || (activeTab === 'ai' && aiSubTab === 'config')) && (
              <GeminiConfigSection
                config={gemini.config}
                models={gemini.models}
                modelDraft={gemini.modelDraft}
                setModelDraft={gemini.setModelDraft}
                isModelDraftDirty={gemini.isModelDraftDirty}
                isSaving={gemini.isSaving}
                isTesting={gemini.isTestingActiveKey}
                isRollingBack={gemini.isRollingBack}
                activeTestResult={gemini.activeTestResult}
                onTestConnection={gemini.testActiveConnection}
                onOpenKeyModal={() => gemini.setIsKeyModalOpen(true)}
                onRollbackKey={gemini.rollbackKey}
                onSaveModels={gemini.saveModelDraft}
              />
            )}

            {/* 2. Token Consumption & Cost Analytics */}
            {(activeTab === 'all' || (activeTab === 'ai' && aiSubTab === 'analytics')) && (
              <GeminiAnalyticsSection
                summary={gemini.usageSummary}
                featureBreakdown={gemini.featureBreakdown}
                modelBreakdown={gemini.modelBreakdown}
                trends={gemini.trends}
                events={gemini.events}
                eventsTotal={gemini.eventsTotal}
                eventsLimit={gemini.eventsLimit}
                eventsOffset={gemini.eventsOffset}
                eventsFeatureFilter={gemini.eventsFeatureFilter}
                isRefreshingEvents={gemini.isRefreshingEvents}
                onFilterChange={(feat) => {
                  gemini.setEventsFeatureFilter(feat);
                  gemini.fetchEventsOnly(0, feat);
                }}
                onPageChange={(offset) => {
                  gemini.fetchEventsOnly(offset, gemini.eventsFeatureFilter);
                }}
              />
            )}

            {/* 3. Daily Per-User AI Quota Enforcement */}
            {(activeTab === 'all' || (activeTab === 'ai' && aiSubTab === 'limits')) && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Per-User Daily Quota Governance
                  </h4>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Reset Boundary:</span>
                    <Badge variant="info" size="sm">00:00 UTC</Badge>
                  </div>
                </div>

                {/* Live Real AI Usage Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <StatsCard
                    title="Today Total"
                    value={aiUsageStats.todayTotalRequests}
                    subtitle="All AI Operations"
                    icon={<Activity className="h-4 w-4" />}
                    accent="teal"
                  />
                  <StatsCard
                    title="Active Users"
                    value={aiUsageStats.todayActiveAiUsers}
                    subtitle="AI Callers Today"
                    icon={<Users className="h-4 w-4" />}
                    accent="cyan"
                  />
                  <StatsCard
                    title="Coach Chat"
                    value={aiUsageStats.breakdownByAction.coach_chat ?? 0}
                    subtitle="Chat queries"
                    icon={<Bot className="h-4 w-4" />}
                    accent="emerald"
                  />
                  <StatsCard
                    title="Meal Scanner"
                    value={aiUsageStats.breakdownByAction.meal_photo ?? 0}
                    subtitle="Vision scans"
                    icon={<Camera className="h-4 w-4" />}
                    accent="purple"
                  />
                  <StatsCard
                    title="Voice Meal"
                    value={aiUsageStats.breakdownByAction.voice_meal ?? 0}
                    subtitle="Audio parses"
                    icon={<Mic className="h-4 w-4" />}
                    accent="amber"
                  />
                  <StatsCard
                    title="Generator"
                    value={aiUsageStats.breakdownByAction.workout_generator ?? 0}
                    subtitle="Plan creations"
                    icon={<Dumbbell className="h-4 w-4" />}
                    accent="rose"
                  />
                </div>

                {/* AI Quotas Configuration Card */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-400">
                        <Gauge className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-white">Daily Per-User Quota Limits</h4>
                        <p className="text-xs text-slate-400">
                          Enforced atomically on PostgreSQL. Users receive 429 RATE_LIMIT_EXCEEDED when exceeded.
                        </p>
                      </div>
                    </div>

                    <span className="text-xs text-slate-400">
                      Version: {records['ai.limits']?.version ?? 1}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 pt-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">
                        Daily Global AI Limit
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={aiLimitsDraft.dailyGlobalLimit}
                        onChange={(e) =>
                          setAiLimitsDraft((prev) => ({
                            ...prev,
                            dailyGlobalLimit: parseInt(e.target.value, 10) || 0,
                          }))
                        }
                        className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-teal-500 focus:outline-none"
                      />
                      <p className="text-[10px] text-slate-500">Max total AI ops / user / day</p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">
                        Coach Chat Daily Limit
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={aiLimitsDraft.coachChatDailyLimit}
                        onChange={(e) =>
                          setAiLimitsDraft((prev) => ({
                            ...prev,
                            coachChatDailyLimit: parseInt(e.target.value, 10) || 0,
                          }))
                        }
                        className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-teal-500 focus:outline-none"
                      />
                      <p className="text-[10px] text-slate-500">Daily chat messages / user</p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">
                        Meal Photo Scanner Limit
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={aiLimitsDraft.mealPhotoDailyLimit}
                        onChange={(e) =>
                          setAiLimitsDraft((prev) => ({
                            ...prev,
                            mealPhotoDailyLimit: parseInt(e.target.value, 10) || 0,
                          }))
                        }
                        className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-teal-500 focus:outline-none"
                      />
                      <p className="text-[10px] text-slate-500">Daily photo scans / user</p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">
                        Voice Meal Entry Limit
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={aiLimitsDraft.voiceMealDailyLimit}
                        onChange={(e) =>
                          setAiLimitsDraft((prev) => ({
                            ...prev,
                            voiceMealDailyLimit: parseInt(e.target.value, 10) || 0,
                          }))
                        }
                        className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-teal-500 focus:outline-none"
                      />
                      <p className="text-[10px] text-slate-500">Daily audio parses / user</p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">
                        Workout Generator Limit
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={aiLimitsDraft.workoutGeneratorDailyLimit}
                        onChange={(e) =>
                          setAiLimitsDraft((prev) => ({
                            ...prev,
                            workoutGeneratorDailyLimit: parseInt(e.target.value, 10) || 0,
                          }))
                        }
                        className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-teal-500 focus:outline-none"
                      />
                      <p className="text-[10px] text-slate-500">Daily workout gens / user</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Gemini Key Rotation Modal */}
      <GeminiKeyModal
        isOpen={gemini.isKeyModalOpen}
        onClose={() => {
          gemini.setIsKeyModalOpen(false);
          gemini.setCandidateKey('');
          gemini.setCandidateKeyError(null);
        }}
        candidateKey={gemini.candidateKey}
        setCandidateKey={gemini.setCandidateKey}
        candidateKeyTestResult={gemini.candidateKeyTestResult}
        candidateKeyError={gemini.candidateKeyError}
        setCandidateKeyError={gemini.setCandidateKeyError}
        isTesting={gemini.isTestingCandidateKey}
        isSaving={gemini.isSaving}
        onTest={gemini.testCandidateKey}
        onSave={gemini.saveNewApiKey}
        currentMask={gemini.config?.keyMask ?? null}
        expectedVersion={gemini.config?.version ?? 1}
      />
    </AdminLayout>
  );
}
