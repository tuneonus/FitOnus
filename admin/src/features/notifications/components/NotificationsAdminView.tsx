'use client';

import React, { useState } from 'react';
import { Bell, Plus } from 'lucide-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { TablePagination } from '@/components/ui/TablePagination';
import { useNotifications } from '../hooks/useNotifications';
import { CATEGORY_LABELS, STATUS_LABELS, STATUS_VARIANTS, audienceSummary } from '../logic';
import type { CampaignStatus, NotificationCampaign } from '../types';
import { NotificationComposerModal } from './NotificationComposerModal';
import { NotificationDetailModal } from './NotificationDetailModal';

const STATUS_FILTERS: { value: CampaignStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Drafts' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'sending', label: 'Sending' },
  { value: 'sent', label: 'Sent' },
  { value: 'partially_failed', label: 'Partially failed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

export function NotificationsAdminView() {
  const list = useNotifications();
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState<NotificationCampaign | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const openNew = () => {
    setDraft(null);
    setComposerOpen(true);
  };

  const openDraft = (campaign: NotificationCampaign) => {
    setDetailId(null);
    setDraft(campaign);
    setComposerOpen(true);
  };

  return (
    <AdminLayout
      title="Notifications"
      subtitle="Send push notifications to members, schedule them, and track delivery."
      onRefresh={list.refresh}
      isRefreshing={list.isRefreshing}
      actions={
        <button type="button" className="btn btn-primary" onClick={openNew}>
          <Plus className="h-4 w-4" />
          New notification
        </button>
      }
    >
      <div className="space-y-4">
        <div className="toolbar sm:flex-row sm:items-center sm:justify-between">
          <div>
            <label htmlFor="notification-status-filter" className="sr-only">Filter by status</label>
            <select
              id="notification-status-filter"
              className="input sm:w-56"
              value={list.status}
              onChange={(e) => list.changeStatus(e.target.value as CampaignStatus | '')}
            >
              {STATUS_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-ink-400">
            <span className="font-semibold tabular-nums text-white">{list.total.toLocaleString()}</span> notifications
          </p>
        </div>

        <div className="table-shell">
          {list.isLoading ? (
            <div className="flex h-72 items-center justify-center">
              <LoadingSpinner size="lg" label="Loading notifications…" />
            </div>
          ) : list.error ? (
            <div className="p-4 sm:p-6">
              <ErrorState title="Couldn't load notifications" message={list.error} compact onRetry={list.refresh} />
            </div>
          ) : list.items.length === 0 ? (
            <EmptyState
              bare
              icon={<Bell />}
              title="No notifications yet"
              description="Create a notification to reach members on their phones and in their in-app inbox."
              action={
                <button type="button" className="btn btn-primary" onClick={openNew}>
                  <Plus className="h-4 w-4" />
                  New notification
                </button>
              }
            />
          ) : (
            <div className="table-scroll">
              <table className="data-table min-w-[820px]">
                <thead>
                  <tr>
                    <th scope="col" className="pl-5">Notification</th>
                    <th scope="col">Audience</th>
                    <th scope="col">Status</th>
                    <th scope="col">When</th>
                    <th scope="col" className="pr-5 text-right">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((item) => (
                    <tr key={item.id}>
                      <td className="pl-5">
                        <p className="max-w-xs truncate font-medium text-white">{item.title}</p>
                        <p className="max-w-xs truncate text-xs text-ink-400">{item.body}</p>
                        <p className="text-[11px] text-ink-500">{CATEGORY_LABELS[item.category]}</p>
                      </td>
                      <td className="text-xs text-ink-200">{audienceSummary(item.audience)}</td>
                      <td>
                        <Badge variant={STATUS_VARIANTS[item.status]} size="sm">{STATUS_LABELS[item.status]}</Badge>
                      </td>
                      <td className="whitespace-nowrap text-xs text-ink-300">
                        {item.status === 'draft' ? `Created ${fmt(item.createdAt)}` : fmt(item.scheduledAt ?? item.createdAt)}
                      </td>
                      <td className="pr-5 text-right">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDetailId(item.id)}>
                          View
                          <span className="sr-only"> {item.title}</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!list.isLoading && !list.error && list.total > 0 && (
          <TablePagination
            page={list.page}
            totalPages={list.totalPages}
            total={list.total}
            pageSize={list.limit}
            onPageChange={list.setPage}
            itemLabel="notifications"
            limit={list.limit}
            limitOptions={[10, 20, 50]}
            onLimitChange={list.changeLimit}
          />
        )}
      </div>

      <NotificationComposerModal
        isOpen={composerOpen}
        onClose={() => setComposerOpen(false)}
        draft={draft}
        onChanged={list.refresh}
      />
      <NotificationDetailModal
        campaignId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={openDraft}
        onChanged={list.refresh}
      />
    </AdminLayout>
  );
}
