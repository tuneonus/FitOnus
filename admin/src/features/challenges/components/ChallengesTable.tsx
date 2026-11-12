'use client';

import React from 'react';
import { Trophy, Pencil, Archive, Send, Award, CheckCircle2, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
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
        return <Badge variant="active" size="sm">Published</Badge>;
      case 'draft':
        return <Badge variant="pending" size="sm">Draft</Badge>;
      case 'archived':
        return <Badge variant="neutral" size="sm">Archived</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{status}</Badge>;
    }
  };

  const getCadenceBadge = (cadence: Challenge['cadence']) => {
    switch (cadence) {
      case 'daily':
        return 'bg-cyan-500/10 text-cyan-300 ring-cyan-500/25';
      case 'weekly':
        return 'bg-brand-500/10 text-brand-300 ring-brand-500/25';
      case 'monthly':
        return 'bg-purple-500/10 text-purple-300 ring-purple-500/25';
      default:
        return 'bg-ink-800 text-ink-300 ring-ink-700';
    }
  };

  return (
    <div className="table-shell">
      {isLoading ? (
        <div className="flex h-80 items-center justify-center">
          <LoadingSpinner size="lg" label="Loading challenges…" />
        </div>
      ) : error ? (
        <div className="p-4 sm:p-6">
          <ErrorState title="Couldn't load challenges" message={error} compact />
        </div>
      ) : challenges.length === 0 ? (
        <EmptyState
          bare
          icon={<Trophy />}
          title="No challenges found"
          description="Create your first community or system challenge to start rewarding member progress."
        />
      ) : (
        <div className="table-scroll">
          <table className="data-table min-w-[980px]">
            <thead>
              <tr>
                <th scope="col" className="pl-5">Challenge</th>
                <th scope="col">Cadence</th>
                <th scope="col">Goal</th>
                <th scope="col">Rewards</th>
                <th scope="col">Enrollment</th>
                <th scope="col">Status</th>
                <th scope="col" className="pr-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {challenges.map((c) => {
                const isActing = actionInProgressId === c.id;
                return (
                  <tr key={c.id}>
                    <td className="pl-5">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="avatar mt-0.5 h-9 w-9 text-ink-300">
                          <Trophy className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="max-w-xs truncate font-medium text-white">{c.title}</p>
                          <p className="max-w-xs truncate font-mono text-[11px] text-ink-500">{c.slug}</p>
                          <p className="mt-0.5 line-clamp-1 max-w-sm text-xs text-ink-400">{c.description}</p>
                        </div>
                      </div>
                    </td>

                    <td className="whitespace-nowrap">
                      <span
                        className={`inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium ring-1 ring-inset ${getCadenceBadge(c.cadence)}`}
                      >
                        <Calendar className="h-3 w-3" />
                        {CADENCE_LABELS[c.cadence] || c.cadence}
                      </span>
                    </td>

                    <td>
                      <p className="whitespace-nowrap">
                        <span className="font-semibold tabular-nums text-white">{c.targetValue}</span>{' '}
                        <span className="text-xs text-ink-400">
                          {METRIC_TYPE_LABELS[c.metricType] || c.metricType}
                        </span>
                      </p>
                      <p className="text-xs capitalize text-ink-500">{CATEGORY_LABELS[c.category] || c.category}</p>
                    </td>

                    <td className="whitespace-nowrap">
                      <p className="inline-flex items-center gap-1 font-medium tabular-nums text-ink-100">
                        <Award className="h-3.5 w-3.5 text-amber-300" />
                        {c.rewardPoints} pts
                      </p>
                      {c.rewardBadgeId && <p className="text-xs text-ink-400">Badge linked</p>}
                    </td>

                    <td className="whitespace-nowrap">
                      {c.autoEnroll ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Auto-enroll
                        </span>
                      ) : (
                        <span className="text-xs text-ink-400">Manual</span>
                      )}
                    </td>

                    <td className="whitespace-nowrap">{getStatusBadge(c.status)}</td>

                    <td className="whitespace-nowrap pr-5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {c.status === 'draft' && (
                          <button
                            type="button"
                            onClick={() => onPublish(c)}
                            disabled={isActing}
                            title="Publish challenge"
                            className="btn btn-secondary btn-sm"
                          >
                            <Send className="h-3.5 w-3.5" />
                            Publish
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => onEdit(c)}
                          disabled={isActing}
                          title="Edit challenge"
                          aria-label={`Edit ${c.title}`}
                          className="btn btn-ghost btn-icon btn-sm"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>

                        {c.status !== 'archived' && (
                          <button
                            type="button"
                            onClick={() => onArchive(c)}
                            disabled={isActing}
                            title="Archive challenge"
                            aria-label={`Archive ${c.title}`}
                            className="btn btn-danger-ghost btn-icon btn-sm text-ink-400"
                          >
                            <Archive className="h-4 w-4" />
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
