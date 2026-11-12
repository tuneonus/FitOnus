'use client';

import React, { useState, useMemo } from 'react';
import { Trophy, Plus, CheckCircle, FileEdit, Archive, AlertTriangle, Award, Search, X } from 'lucide-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { StatsCard } from '@/components/ui/StatsCard';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TabBar } from '@/components/ui/TabBar';
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
      title="Challenges"
      subtitle="Configure community fitness challenges, badges and rewards."
      onRefresh={refresh}
      isRefreshing={isRefreshing}
    >
      <div className="space-y-6">
        <TabBar
          ariaLabel="Challenges sections"
          active={activeTab}
          onChange={setActiveTab}
          tabs={[
            { id: 'challenges', label: 'Challenges', icon: <Trophy /> },
            { id: 'badges', label: 'Badges & rewards', icon: <Award /> },
          ]}
        />

        {activeTab === 'badges' ? (
          <BadgesCatalogCard />
        ) : (
          <>
            <section aria-label="Challenge metrics" className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4 sm:gap-4">
              <StatsCard
                title="Total challenges"
                value={stats.total.toString()}
                subtitle="Configured in system"
                icon={<Trophy />}
                accent="teal"
              />
              <StatsCard
                title="Published"
                value={stats.published.toString()}
                subtitle="Available to members"
                icon={<CheckCircle />}
                accent="emerald"
              />
              <StatsCard
                title="Drafts"
                value={stats.draft.toString()}
                subtitle="Awaiting publishing"
                icon={<FileEdit />}
                accent="amber"
              />
              <StatsCard
                title="Archived"
                value={stats.archived.toString()}
                subtitle="Historical challenges"
                icon={<Archive />}
                accent="rose"
              />
            </section>

            {actionError && (
              <div role="alert" className="alert alert-error items-center">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <div className="flex-1">{actionError}</div>
                <button
                  type="button"
                  onClick={() => setActionError(null)}
                  aria-label="Dismiss error"
                  className="btn btn-ghost btn-icon btn-sm text-rose-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="space-y-4">
              <div className="toolbar">
                <div className="segmented self-start overflow-x-auto" role="group" aria-label="Filter by status">
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
                      type="button"
                      onClick={() => setStatusFilter(tab.value as ChallengeStatus | '')}
                      data-active={statusFilter === tab.value}
                      aria-pressed={statusFilter === tab.value}
                      className="segmented-item whitespace-nowrap"
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:ml-auto">
                  <div className="relative min-w-0 sm:w-56">
                    <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                    <label htmlFor="challenge-search" className="sr-only">Search challenges</label>
                    <input
                      id="challenge-search"
                      type="search"
                      placeholder="Search challenges…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="input pl-9"
                    />
                  </div>

                  <label htmlFor="challenge-cadence" className="sr-only">Cadence</label>
                  <select
                    id="challenge-cadence"
                    value={cadenceFilter}
                    onChange={(e) => setCadenceFilter(e.target.value as ChallengeCadence | '')}
                    className="input sm:w-40"
                  >
                    <option value="">All cadences</option>
                    {(Object.keys(CADENCE_LABELS) as ChallengeCadence[]).map((c) => (
                      <option key={c} value={c}>
                        {CADENCE_LABELS[c]}
                      </option>
                    ))}
                  </select>

                  <button type="button" onClick={handleOpenCreate} className="btn btn-primary">
                    <Plus className="h-4 w-4" />
                    New challenge
                  </button>
                </div>
              </div>

              <ChallengesTable
                challenges={filteredChallenges}
                isLoading={isLoading}
                error={error}
                onEdit={handleOpenEdit}
                onPublish={(c) => setChallengeToPublish(c)}
                onArchive={(c) => setChallengeToArchive(c)}
                actionInProgressId={actionInProgressId}
              />
            </div>
          </>
        )}

        <ChallengeModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          challenge={selectedChallenge}
          onSubmit={handleSaveChallenge}
        />

        <ConfirmDialog
          isOpen={Boolean(challengeToPublish)}
          onClose={() => setChallengeToPublish(null)}
          onConfirm={handleConfirmPublish}
          isBusy={Boolean(actionInProgressId)}
          tone="primary"
          title="Publish challenge?"
          description="It immediately becomes eligible for active occurrence windows and member participation."
          confirmLabel="Publish"
          busyLabel="Publishing…"
        >
          <span className="font-semibold text-white">{challengeToPublish?.title}</span>{' '}
          <span className="text-ink-400">({challengeToPublish?.cadence})</span>
        </ConfirmDialog>

        <ConfirmDialog
          isOpen={Boolean(challengeToArchive)}
          onClose={() => setChallengeToArchive(null)}
          onConfirm={handleConfirmArchive}
          isBusy={Boolean(actionInProgressId)}
          title="Archive challenge?"
          description="Archiving disables future automatic occurrence generation. Existing active enrollments continue until their period ends."
          confirmLabel="Archive"
          busyLabel="Archiving…"
        >
          <span className="font-semibold text-white">{challengeToArchive?.title}</span> will be moved to
          the archived state.
        </ConfirmDialog>
      </div>
    </AdminLayout>
  );
}
