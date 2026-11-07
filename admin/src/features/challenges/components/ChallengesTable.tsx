'use client';

import React from 'react';
import {
  Trophy,
  Edit2,
  Archive,
  Send,
  AlertTriangle,
  Award,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Challenge } from '../types';
import {
  CADENCE_LABELS,
  CATEGORY_LABELS,
  METRIC_TYPE_LABELS,
} from '../types';

interface ChallengesTableProps {
  challenges: Challenge[];
  isLoading: boolean;
  error: string | null;
  onEdit: (challenge: Challenge) => void;
  onPublish: (challenge: Challenge) => void;
  onArchive: (challenge: Challenge) => void;
  actionInProgressId?: string | null;
}

export function ChallengesTable({
  challenges,
  isLoading,
  error,
  onEdit,
  onPublish,
  onArchive,
  actionInProgressId,
}: ChallengesTableProps) {
  const getStatusBadge = (status: Challenge['status']) => {
    switch (status) {
      case 'published':
        return <Badge variant="active">Published</Badge>;
      case 'draft':
        return <Badge variant="pending">Draft</Badge>;
      case 'archived':
        return <Badge variant="neutral">Archived</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const getCadenceBadge = (cadence: Challenge['cadence']) => {
    switch (cadence) {
      case 'daily':
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
      case 'weekly':
        return 'bg-teal-500/10 text-teal-300 border border-teal-500/20';
      case 'monthly':
        return 'bg-purple-500/10 text-purple-300 border border-purple-500/20';
      default:
        return 'bg-slate-800 text-slate-300 border border-slate-700';
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-sm overflow-hidden">
      {isLoading ? (
        <div className="flex h-80 items-center justify-center">
          <LoadingSpinner size="lg" label="Loading challenges catalog..." />
        </div>
      ) : error ? (
        <div className="p-8 text-center text-rose-400">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-rose-500" />
          <p className="text-sm font-semibold">{error}</p>
        </div>
      ) : challenges.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-6 w-6" />}
          title="No challenges found"
          description="Create your first community or system challenge to start rewarding member progress."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/40 text-slate-400">
                <th className="py-3.5 px-6 font-semibold uppercase tracking-wider">Challenge</th>
                <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Cadence</th>
                <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Goal & Metric</th>
                <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Rewards</th>
                <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Auto-Enroll</th>
                <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Status</th>
                <th className="py-3.5 px-6 font-semibold uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {challenges.map((c) => {
                const isActing = actionInProgressId === c.id;
                return (
                  <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
                    {/* Challenge Info */}
                    <td className="py-4 px-6">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-400">
                          <Trophy className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-white truncate max-w-xs">{c.title}</p>
                          <p className="text-[11px] text-slate-400 font-mono truncate max-w-xs">{c.slug}</p>
                          <p className="text-[11px] text-slate-500 line-clamp-1 max-w-sm mt-0.5">
                            {c.description}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Cadence */}
                    <td className="py-4 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${getCadenceBadge(
                          c.cadence,
                        )}`}
                      >
                        <Calendar className="h-3 w-3" />
                        {CADENCE_LABELS[c.cadence] || c.cadence}
                      </span>
                    </td>

                    {/* Goal & Metric */}
                    <td className="py-4 px-4">
                      <div>
                        <span className="font-semibold text-white">
                          {c.targetValue}{' '}
                          <span className="text-[11px] font-normal text-slate-400">
                            {METRIC_TYPE_LABELS[c.metricType] || c.metricType}
                          </span>
                        </span>
                        <div className="text-[11px] text-slate-500 capitalize">
                          {CATEGORY_LABELS[c.category] || c.category}
                        </div>
                      </div>
                    </td>

                    {/* Rewards */}
                    <td className="py-4 px-4 whitespace-nowrap">
                      <div className="flex flex-col gap-0.5">
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-400">
                          <Award className="h-3.5 w-3.5" />
                          {c.rewardPoints} pts
                        </span>
                        {c.rewardBadgeId && (
                          <span className="text-[10px] text-purple-400 font-mono">Badge linked</span>
                        )}
                      </div>
                    </td>

                    {/* Auto-Enroll */}
                    <td className="py-4 px-4 whitespace-nowrap">
                      {c.autoEnroll ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Yes
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500">Manual</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-4 px-4 whitespace-nowrap">{getStatusBadge(c.status)}</td>

                    {/* Actions */}
                    <td className="py-4 px-6 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Edit */}
                        <button
                          type="button"
                          onClick={() => onEdit(c)}
                          disabled={isActing}
                          title="Edit Challenge"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors disabled:opacity-40"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>

                        {/* Publish (if draft) */}
                        {c.status === 'draft' && (
                          <button
                            type="button"
                            onClick={() => onPublish(c)}
                            disabled={isActing}
                            title="Publish Challenge"
                            className="inline-flex items-center gap-1 rounded-lg bg-teal-500/10 border border-teal-500/20 px-2 py-1 text-[11px] font-medium text-teal-300 hover:bg-teal-500/20 transition-colors disabled:opacity-40"
                          >
                            <Send className="h-3 w-3" />
                            <span>Publish</span>
                          </button>
                        )}

                        {/* Archive (if not archived) */}
                        {c.status !== 'archived' && (
                          <button
                            type="button"
                            onClick={() => onArchive(c)}
                            disabled={isActing}
                            title="Archive Challenge"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 transition-colors disabled:opacity-40"
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

