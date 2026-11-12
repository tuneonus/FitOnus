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
import { TabBar } from '@/components/ui/TabBar';
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
      <AdminLayout title="Settings" subtitle="Remote configuration, feature flags and AI quota governance.">
        <div className="flex h-96 items-center justify-center">
          <LoadingSpinner size="lg" label="Loading application settings…" />
        </div>
      </AdminLayout>
    );
  }

  const isMaintenanceActive = maintenanceDraft.enabled;

  return (
    <AdminLayout
      title="Settings"
      subtitle="Remote configuration, feature flags and AI quota governance."
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing || gemini.isRefreshingEvents}
    >
      <div className="space-y-6 pb-8">
        {isMaintenanceActive && (
          <div role="status" className="alert alert-warning flex-col sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold text-amber-100">Maintenance mode is enabled</p>
                <p className="text-xs text-amber-200/80">
                  Mobile apps show the maintenance overlay. Admin operations remain fully accessible.
                </p>
              </div>
            </div>
            <Badge variant="warning">Maintenance live</Badge>
          </div>
        )}

        <div className="sticky top-14 z-20 -mx-4 border-y border-ink-800 bg-ink-950/90 px-4 py-3 backdrop-blur-md sm:mx-0 sm:rounded-xl sm:border sm:bg-ink-900/95 sm:px-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ink-850 text-ink-300 ring-1 ring-ink-800 sm:flex">
                <Sliders className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[13px] font-semibold text-white">Application configuration</h2>
                  {isDirty ? (
                    <Badge variant="warning" size="sm">Unsaved changes</Badge>
                  ) : (
                    <Badge variant="neutral" size="sm">Up to date</Badge>
                  )}
                </div>
                <p className="text-xs text-ink-400">
                  Saved with optimistic concurrency and applied to the public configuration cache.
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={resetDraft}
                disabled={!isDirty || isSaving}
                className="btn btn-secondary"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Discard
              </button>

              <button
                type="button"
                onClick={() => saveSettings()}
                disabled={!isDirty || isSaving}
                className="btn btn-primary"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" />
                    Save changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <TabBar
          ariaLabel="Settings sections"
          active={activeTab}
          onChange={setActiveTab}
          tabs={[
            { id: 'all', label: 'All sections' },
            {
              id: 'app',
              label: 'App management',
              dirty: isMaintenanceDirty || isMinVersionDirty || isForceUpdateDirty || isSupportDirty || isLegalDirty,
            },
            { id: 'features', label: 'Features', dirty: isFeaturesDirty },
            { id: 'ai', label: 'AI & quotas', dirty: isAiLimitsDirty },
          ]}
        />

        {/* ========================================================= */}
        {/* SECTION A: APP MANAGEMENT                                 */}
        {/* ========================================================= */}
        {(activeTab === 'all' || activeTab === 'app') && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[15px] font-semibold tracking-tight text-white">
                  App Management
                </h3>
                <p className="mt-0.5 text-[13px] text-ink-400">
                  System availability, minimum version enforcement, and public support channels.
                </p>
              </div>
            </div>

            {/* Maintenance Mode Card */}
            <div className="card space-y-4 p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ink-850 text-ink-300 ring-1 ring-ink-800">
                    <ShieldAlert className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">Maintenance Mode</h4>
                    <p className="text-xs text-ink-400">
                      Instantly pause mobile member access for server updates or migrations.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-ink-400">
                    Version: {records['app.maintenance']?.version ?? 1}
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={maintenanceDraft.enabled}
                      onChange={(e) =>
                        setMaintenanceDraft((prev) => ({ ...prev, enabled: e.target.checked }))
                      }
                      aria-label="Enable Maintenance Mode"
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-ink-800 ring-1 ring-inset ring-ink-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/60 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-ink-900 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ink-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="space-y-1.5 md:col-span-2">
                  <label htmlFor="app-settings-field-1" className="block text-xs font-medium text-ink-300">
                    Maintenance Announcement Message
                  </label>
                  <textarea
                    id="app-settings-field-1"
                    rows={2}
                    value={maintenanceDraft.message}
                    onChange={(e) =>
                      setMaintenanceDraft((prev) => ({ ...prev, message: e.target.value }))
                    }
                    placeholder="OnusFit is currently undergoing scheduled maintenance..."
                    className="input"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="app-settings-field-2" className="block text-xs font-medium text-ink-300">
                    Expected Completion Time (Optional ISO / Datetime)
                  </label>
                  <input
                    id="app-settings-field-2"
                    type="text"
                    value={maintenanceDraft.expectedEndTime || ''}
                    onChange={(e) =>
                      setMaintenanceDraft((prev) => ({
                        ...prev,
                        expectedEndTime: e.target.value.trim() ? e.target.value : null,
                      }))
                    }
                    placeholder="2026-11-09T12:00:00Z"
                    className="input"
                  />
                </div>
              </div>
            </div>

            {/* Version & Force Update Card */}
            <div className="card space-y-4 p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ink-850 text-ink-300 ring-1 ring-ink-800">
                    <Smartphone className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">App Version & Force Update</h4>
                    <p className="text-xs text-ink-400">
                      Enforce minimum app client version requirements and store redirects.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-ink-400">
                    Version: {records['app.force_update']?.version ?? 1}
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={forceUpdateDraft.enabled}
                      onChange={(e) =>
                        setForceUpdateDraft((prev) => ({ ...prev, enabled: e.target.checked }))
                      }
                      aria-label="Enable force update"
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-ink-800 ring-1 ring-inset ring-ink-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/60 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-ink-900 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ink-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500"></div>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="space-y-1.5">
                  <label htmlFor="app-settings-field-3" className="block text-xs font-medium text-ink-300">
                    Android Minimum Supported Version (Semver)
                  </label>
                  <input
                    id="app-settings-field-3"
                    type="text"
                    value={minVersionDraft.androidMinVersion}
                    onChange={(e) =>
                      setMinVersionDraft({ androidMinVersion: e.target.value.trim() })
                    }
                    placeholder="1.0.0"
                    className="input"
                  />
                  <p className="text-[11px] leading-relaxed text-ink-500">
                    Apps below this version are blocked when Force Update is active.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="app-settings-field-4" className="block text-xs font-medium text-ink-300">
                    Google Play Store URL
                  </label>
                  <input
                    id="app-settings-field-4"
                    type="url"
                    value={forceUpdateDraft.storeUrl}
                    onChange={(e) =>
                      setForceUpdateDraft((prev) => ({ ...prev, storeUrl: e.target.value }))
                    }
                    placeholder="https://play.google.com/store/apps/details?id=com.tuneonus.onusfit"
                    className="input"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label htmlFor="app-settings-field-5" className="block text-xs font-medium text-ink-300">
                    Force Update Prompt Message
                  </label>
                  <textarea
                    id="app-settings-field-5"
                    rows={2}
                    value={forceUpdateDraft.updateMessage}
                    onChange={(e) =>
                      setForceUpdateDraft((prev) => ({ ...prev, updateMessage: e.target.value }))
                    }
                    placeholder="A critical update is required to continue using OnusFit..."
                    className="input"
                  />
                </div>
              </div>
            </div>

            {/* Support & Legal Card */}
            <div className="card space-y-4 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ink-850 text-ink-300 ring-1 ring-ink-800">
                  <Mail className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Support & Legal Information</h4>
                  <p className="text-xs text-ink-400">
                    Public contact details and legal compliance endpoints.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="space-y-1.5">
                  <label htmlFor="app-settings-field-6" className="block text-xs font-medium text-ink-300">Support Email</label>
                  <input
                    id="app-settings-field-6"
                    type="email"
                    value={supportDraft.email}
                    onChange={(e) =>
                      setSupportDraft((prev) => ({ ...prev, email: e.target.value.trim() }))
                    }
                    placeholder="support@fitonus.com"
                    className="input"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="app-settings-field-7" className="block text-xs font-medium text-ink-300">Support Website</label>
                  <input
                    id="app-settings-field-7"
                    type="url"
                    value={supportDraft.website}
                    onChange={(e) =>
                      setSupportDraft((prev) => ({ ...prev, website: e.target.value.trim() }))
                    }
                    placeholder="https://fitonus.com/support"
                    className="input"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="app-settings-field-8" className="block text-xs font-medium text-ink-300">Contact Info / Hotline</label>
                  <input
                    id="app-settings-field-8"
                    type="text"
                    value={supportDraft.contactInfo}
                    onChange={(e) =>
                      setSupportDraft((prev) => ({ ...prev, contactInfo: e.target.value }))
                    }
                    placeholder="+1 (800) 555-ONUS"
                    className="input"
                  />
                </div>

                <div className="space-y-1.5 ">
                  <label htmlFor="app-settings-field-9" className="block text-xs font-medium text-ink-300">Privacy Policy URL</label>
                  <input
                    id="app-settings-field-9"
                    type="url"
                    value={legalDraft.privacyPolicyUrl}
                    onChange={(e) =>
                      setLegalDraft((prev) => ({ ...prev, privacyPolicyUrl: e.target.value.trim() }))
                    }
                    placeholder="https://fitonus.com/privacy"
                    className="input"
                  />
                </div>

                <div className="space-y-1.5 ">
                  <label htmlFor="app-settings-field-10" className="block text-xs font-medium text-ink-300">Terms of Service URL</label>
                  <input
                    id="app-settings-field-10"
                    type="url"
                    value={legalDraft.termsOfServiceUrl}
                    onChange={(e) =>
                      setLegalDraft((prev) => ({ ...prev, termsOfServiceUrl: e.target.value.trim() }))
                    }
                    placeholder="https://fitonus.com/terms"
                    className="input"
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
                <h3 className="text-[15px] font-semibold tracking-tight text-white">
                  Feature Management (Remote Feature Flags)
                </h3>
                <p className="mt-0.5 text-[13px] text-ink-400">
                  Enable or disable application modules in real time. Backend enforces permissions and preserves all user records.
                </p>
              </div>
              <Badge variant={records['features.flags'] ? 'completed' : 'neutral'} size="sm">
                v{records['features.flags']?.version ?? 1}
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Feature 1: AI Coach */}
              <div className="card space-y-3 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ink-850 text-ink-300 ring-1 ring-ink-800">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">AI Coach Conversation</h4>
                      <p className="text-xs text-ink-400">Chat and workout advisory assistant</p>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={featuresDraft.aiCoach}
                      onChange={(e) =>
                        setFeaturesDraft((prev) => ({ ...prev, aiCoach: e.target.checked }))
                      }
                      aria-label="Enable AI Coach Conversation"
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-ink-800 ring-1 ring-inset ring-ink-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/60 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-ink-900 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ink-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between text-xs text-ink-500 border-t border-ink-800 pt-2">
                  <span>Status:</span>
                  <Badge variant={featuresDraft.aiCoach ? 'active' : 'disabled'} size="sm">
                    {featuresDraft.aiCoach ? 'Active on Mobile' : 'Disabled / Gated'}
                  </Badge>
                </div>
              </div>

              {/* Feature 2: Meal Photo Scanner */}
              <div className="card space-y-3 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ink-850 text-ink-300 ring-1 ring-ink-800">
                      <Camera className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">AI Meal Photo Scanner</h4>
                      <p className="text-xs text-ink-400">Multimodal Gemini vision meal analysis</p>
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
                      aria-label="Enable AI Meal Photo Scanner"
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-ink-800 ring-1 ring-inset ring-ink-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/60 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-ink-900 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ink-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between text-xs text-ink-500 border-t border-ink-800 pt-2">
                  <span>Status:</span>
                  <Badge variant={featuresDraft.mealPhotoScanner ? 'active' : 'disabled'} size="sm">
                    {featuresDraft.mealPhotoScanner ? 'Active on Mobile' : 'Disabled / Gated'}
                  </Badge>
                </div>
              </div>

              {/* Feature 3: Voice Meal Entry */}
              <div className="card space-y-3 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ink-850 text-ink-300 ring-1 ring-ink-800">
                      <Mic className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">Voice Meal Entry</h4>
                      <p className="text-xs text-ink-400">Natural voice to nutrition intake parser</p>
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
                      aria-label="Enable Voice Meal Entry"
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-ink-800 ring-1 ring-inset ring-ink-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/60 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-ink-900 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ink-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between text-xs text-ink-500 border-t border-ink-800 pt-2">
                  <span>Status:</span>
                  <Badge variant={featuresDraft.voiceMealEntry ? 'active' : 'disabled'} size="sm">
                    {featuresDraft.voiceMealEntry ? 'Active on Mobile' : 'Disabled / Gated'}
                  </Badge>
                </div>
              </div>

              {/* Feature 4: Workout Generator */}
              <div className="card space-y-3 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ink-850 text-ink-300 ring-1 ring-ink-800">
                      <Dumbbell className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">Workout Generator</h4>
                      <p className="text-xs text-ink-400">Automated custom fitness plan generation</p>
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
                      aria-label="Enable Workout Generator"
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-ink-800 ring-1 ring-inset ring-ink-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/60 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-ink-900 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ink-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between text-xs text-ink-500 border-t border-ink-800 pt-2">
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
                <h3 className="text-[15px] font-semibold tracking-tight text-white">
                  AI Management & Live Analytics
                </h3>
                <p className="mt-0.5 text-[13px] text-ink-400">
                  Secure Gemini API key management, dynamic per-feature model selection, and token usage analytics.
                </p>
              </div>

              {/* Sub-Navigation when filtered to AI */}
              {activeTab === 'ai' && (
                <div className="segmented max-w-full self-start overflow-x-auto" role="group" aria-label="AI settings view">
                  <button
                    type="button"
                    onClick={() => setAiSubTab('config')}
                    data-active={aiSubTab === 'config'}
                    aria-pressed={aiSubTab === 'config'}
                    className="segmented-item whitespace-nowrap"
                  >
                    Gemini configuration
                    {gemini.isModelDraftDirty && (
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-label="Unsaved changes" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiSubTab('analytics')}
                    data-active={aiSubTab === 'analytics'}
                    aria-pressed={aiSubTab === 'analytics'}
                    className="segmented-item whitespace-nowrap"
                  >
                    Usage & cost
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiSubTab('limits')}
                    data-active={aiSubTab === 'limits'}
                    aria-pressed={aiSubTab === 'limits'}
                    className="segmented-item whitespace-nowrap"
                  >
                    User quotas
                    {isAiLimitsDirty && (
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-label="Unsaved changes" />
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
                  <h4 className="eyebrow">
                    Per-User Daily Quota Governance
                  </h4>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-ink-400">Reset Boundary:</span>
                    <Badge variant="info" size="sm">00:00 UTC</Badge>
                  </div>
                </div>

                {/* Live Real AI Usage Stats Grid */}
                <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 2xl:grid-cols-6">
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
                <div className="card space-y-4 p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ink-850 text-ink-300 ring-1 ring-ink-800">
                        <Gauge className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-white">Daily Per-User Quota Limits</h4>
                        <p className="text-xs text-ink-400">
                          Enforced atomically on PostgreSQL. Users receive 429 RATE_LIMIT_EXCEEDED when exceeded.
                        </p>
                      </div>
                    </div>

                    <span className="text-xs text-ink-400">
                      Version: {records['ai.limits']?.version ?? 1}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 pt-2">
                    <div className="space-y-1.5">
                      <label htmlFor="app-settings-field-11" className="block text-xs font-medium text-ink-300">
                        Daily Global AI Limit
                      </label>
                      <input
                    id="app-settings-field-11"
                        type="number"
                        min={1}
                        value={aiLimitsDraft.dailyGlobalLimit}
                        onChange={(e) =>
                          setAiLimitsDraft((prev) => ({
                            ...prev,
                            dailyGlobalLimit: parseInt(e.target.value, 10) || 0,
                          }))
                        }
                        className="input"
                      />
                      <p className="text-[11px] text-ink-500">Max total AI ops / user / day</p>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="app-settings-field-12" className="block text-xs font-medium text-ink-300">
                        Coach Chat Daily Limit
                      </label>
                      <input
                    id="app-settings-field-12"
                        type="number"
                        min={0}
                        value={aiLimitsDraft.coachChatDailyLimit}
                        onChange={(e) =>
                          setAiLimitsDraft((prev) => ({
                            ...prev,
                            coachChatDailyLimit: parseInt(e.target.value, 10) || 0,
                          }))
                        }
                        className="input"
                      />
                      <p className="text-[11px] text-ink-500">Daily chat messages / user</p>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="app-settings-field-13" className="block text-xs font-medium text-ink-300">
                        Meal Photo Scanner Limit
                      </label>
                      <input
                    id="app-settings-field-13"
                        type="number"
                        min={0}
                        value={aiLimitsDraft.mealPhotoDailyLimit}
                        onChange={(e) =>
                          setAiLimitsDraft((prev) => ({
                            ...prev,
                            mealPhotoDailyLimit: parseInt(e.target.value, 10) || 0,
                          }))
                        }
                        className="input"
                      />
                      <p className="text-[11px] text-ink-500">Daily photo scans / user</p>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="app-settings-field-14" className="block text-xs font-medium text-ink-300">
                        Voice Meal Entry Limit
                      </label>
                      <input
                    id="app-settings-field-14"
                        type="number"
                        min={0}
                        value={aiLimitsDraft.voiceMealDailyLimit}
                        onChange={(e) =>
                          setAiLimitsDraft((prev) => ({
                            ...prev,
                            voiceMealDailyLimit: parseInt(e.target.value, 10) || 0,
                          }))
                        }
                        className="input"
                      />
                      <p className="text-[11px] text-ink-500">Daily audio parses / user</p>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="app-settings-field-15" className="block text-xs font-medium text-ink-300">
                        Workout Generator Limit
                      </label>
                      <input
                    id="app-settings-field-15"
                        type="number"
                        min={0}
                        value={aiLimitsDraft.workoutGeneratorDailyLimit}
                        onChange={(e) =>
                          setAiLimitsDraft((prev) => ({
                            ...prev,
                            workoutGeneratorDailyLimit: parseInt(e.target.value, 10) || 0,
                          }))
                        }
                        className="input"
                      />
                      <p className="text-[11px] text-ink-500">Daily workout gens / user</p>
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
