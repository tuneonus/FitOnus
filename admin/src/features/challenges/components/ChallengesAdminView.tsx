'use client';

import React, { useState, useMemo } from 'react';
import {
  Trophy,
  Plus,
  CheckCircle,
  FileEdit,
  Archive,
  AlertTriangle,
  Award,
  Search,
} from 'lucide-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { StatsCard } from '@/components/ui/StatsCard';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/context/ToastContext';
import { useChallenges } from '../hooks/useChallenges';
import { challengesApi } from '../api';
import { ChallengeModal } from './ChallengeModal';
import { ChallengesTable } from './ChallengesTable';
import { BadgesCatalogCard } from './BadgesCatalogCard';
import type {
  Challenge,
  ChallengeCadence,
  ChallengeStatus,
  CreateChallengeInput,
  UpdateChallengeInput,
} from '../types';
import { CADENCE_LABELS } from '../types';

export function ChallengesAdminView() {
  const { toast } = useToast();
  const {
    challenges,
    isLoading,
    isRefreshing,
    error,
    statusFilter,
    setStatusFilter,
    cadenceFilter,
    setCadenceFilter,
    refresh,
    stats,
  } = useChallenges();

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);

  // Tab switcher
  const [activeTab, setActiveTab] = useState<'challenges' | 'badges'>('challenges');
  const [searchQuery, setSearchQuery] = useState('');

  // Status transition confirmation modals
  const [challengeToPublish, setChallengeToPublish] = useState<Challenge | null>(null);
  const [challengeToArchive, setChallengeToArchive] = useState<Challenge | null>(null);
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filteredChallenges = useMemo(() => {
    if (!searchQuery.trim()) return challenges;
    const q = searchQuery.toLowerCase();
    return challenges.filter(
      (c) => c.title.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q)
    );
  }, [challenges, searchQuery]);

  // Open create
  const handleOpenCreate = () => {
    setSelectedChallenge(null);
    setIsModalOpen(true);
  };

  // Open edit
  const handleOpenEdit = (challenge: Challenge) => {
    setSelectedChallenge(challenge);
    setIsModalOpen(true);
  };

  // Save create or edit
  const handleSaveChallenge = async (data: CreateChallengeInput | UpdateChallengeInput) => {
    try {
      if (selectedChallenge) {
        await challengesApi.updateChallenge(selectedChallenge.id, data as UpdateChallengeInput);
        toast.success('Challenge updated successfully.');
      } else {
        await challengesApi.createChallenge(data as CreateChallengeInput);
        toast.success('Challenge created successfully.');
      }
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save challenge.';
      toast.error(msg);
      throw err;
    }
  };

  // Confirm publish
  const handleConfirmPublish = async () => {
    if (!challengeToPublish || actionInProgressId) return;
    setActionInProgressId(challengeToPublish.id);
    setActionError(null);
    try {
      await challengesApi.publishChallenge(challengeToPublish.id);
      toast.success(`Published challenge "${challengeToPublish.title}".`);
      setChallengeToPublish(null);
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to publish challenge.';
      setActionError(msg);
      toast.error(msg);
    } finally {
      setActionInProgressId(null);
    }
  };

  // Confirm archive
  const handleConfirmArchive = async () => {
    if (!challengeToArchive || actionInProgressId) return;
    setActionInProgressId(challengeToArchive.id);
    setActionError(null);
    try {
      await challengesApi.archiveChallenge(challengeToArchive.id);
      toast.success(`Archived challenge "${challengeToArchive.title}".`);
      setChallengeToArchive(null);
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to archive challenge.';
      setActionError(msg);
      toast.error(msg);
    } finally {
      setActionInProgressId(null);
    }
  };

  return (
    <AdminLayout
      title="Challenges & Gamification"
      subtitle="Configure, evaluate, and monitor community fitness challenges and badge rewards"
      onRefresh={refresh}
      isRefreshing={isRefreshing}
    >
      <div className="space-y-6">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab('challenges')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'challenges'
                ? 'bg-teal-500/10 text-teal-300 border border-teal-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Trophy className="h-4 w-4" />
            <span>Challenges Catalog</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('badges')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'badges'
                ? 'bg-teal-500/10 text-teal-300 border border-teal-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Award className="h-4 w-4" />
            <span>Badges & Rewards</span>
          </button>
        </div>

        {activeTab === 'badges' ? (
          <BadgesCatalogCard />
        ) : (
          <>
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatsCard
                title="Total Challenges"
                value={stats.total.toString()}
                subtitle="Configured in system"
                icon={<Trophy className="h-5 w-5" />}
                accent="teal"
              />
              <StatsCard
                title="Published Active"
                value={stats.published.toString()}
                subtitle="Available to members"
                icon={<CheckCircle className="h-5 w-5" />}
                accent="emerald"
              />
              <StatsCard
                title="Draft Challenges"
                value={stats.draft.toString()}
                subtitle="Awaiting publishing"
                icon={<FileEdit className="h-5 w-5" />}
                accent="amber"
              />
              <StatsCard
                title="Archived"
                value={stats.archived.toString()}
                subtitle="Historical challenges"
                icon={<Archive className="h-5 w-5" />}
                accent="rose"
              />
            </div>

            {/* Action Error Banner */}
            {actionError && (
              <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3.5 text-xs text-rose-300">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                <div className="flex-1">{actionError}</div>
                <button
                  onClick={() => setActionError(null)}
                  className="text-rose-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Filter and Control Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-sm">
              {/* Status Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                {(
                  [
                    { label: 'All', value: '' },
                    { label: 'Published', value: 'published' },
                    { label: 'Drafts', value: 'draft' },
                    { label: 'Archived', value: 'archived' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => setStatusFilter(tab.value as ChallengeStatus | '')}
                    className={`rounded-xl px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      statusFilter === tab.value
                        ? 'bg-teal-500/10 text-teal-300 border border-teal-500/20 shadow-sm'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Right Controls: Search + Cadence Filter + Create Button */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative sm:w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search challenges..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800/90 pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <select
                  value={cadenceFilter}
                  onChange={(e) => setCadenceFilter(e.target.value as ChallengeCadence | '')}
                  className="rounded-xl border border-slate-700 bg-slate-800/90 px-3 py-1.5 text-xs text-slate-200 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  <option value="">All Cadences</option>
                  {(Object.keys(CADENCE_LABELS) as ChallengeCadence[]).map((c) => (
                    <option key={c} value={c}>
                      {CADENCE_LABELS[c]}
                    </option>
                  ))}
                </select>

                <button
                  onClick={handleOpenCreate}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:from-teal-400 hover:to-emerald-400 transition-all shadow-md shadow-teal-500/20 whitespace-nowrap"
                >
                  <Plus className="h-4 w-4 stroke-[2.5]" />
                  <span>New Challenge</span>
                </button>
              </div>
            </div>

            {/* Challenges Table */}
            <ChallengesTable
              challenges={filteredChallenges}
              isLoading={isLoading}
              error={error}
              onEdit={handleOpenEdit}
              onPublish={(c) => setChallengeToPublish(c)}
              onArchive={(c) => setChallengeToArchive(c)}
              actionInProgressId={actionInProgressId}
            />
          </>
        )}

        {/* Create / Edit Modal */}
        <ChallengeModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          challenge={selectedChallenge}
          onSubmit={handleSaveChallenge}
        />

        {/* Publish Confirmation Modal */}
        <Modal
          isOpen={Boolean(challengeToPublish)}
          onClose={() => setChallengeToPublish(null)}
          title="Publish Challenge"
          description="Are you sure you want to publish this challenge? It will immediately become eligible for active occurrence windows and member participation."
          maxWidth="sm"
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-teal-500/20 bg-teal-500/10 p-3.5 text-xs text-teal-300">
              <span className="font-semibold">{challengeToPublish?.title}</span> ({challengeToPublish?.cadence})
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setChallengeToPublish(null)}
                disabled={Boolean(actionInProgressId)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPublish}
                disabled={Boolean(actionInProgressId)}
                className="rounded-xl bg-teal-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-teal-400 transition-colors disabled:opacity-50"
              >
                {actionInProgressId ? 'Publishing...' : 'Confirm Publish'}
              </button>
            </div>
          </div>
        </Modal>

        {/* Archive Confirmation Modal */}
        <Modal
          isOpen={Boolean(challengeToArchive)}
          onClose={() => setChallengeToArchive(null)}
          title="Archive Challenge"
          description="Archiving will disable future automatic occurrence generation. Existing active enrollments will continue until their period ends."
          maxWidth="sm"
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3.5 text-xs text-rose-300">
              <span className="font-semibold">{challengeToArchive?.title}</span> will be moved to archived state.
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setChallengeToArchive(null)}
                disabled={Boolean(actionInProgressId)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmArchive}
                disabled={Boolean(actionInProgressId)}
                className="rounded-xl bg-rose-500 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-600 transition-colors disabled:opacity-50"
              >
                {actionInProgressId ? 'Archiving...' : 'Confirm Archive'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </AdminLayout>
  );
}

