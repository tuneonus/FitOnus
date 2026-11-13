'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Ban, Pencil } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Badge } from '@/components/ui/Badge';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { TablePagination } from '@/components/ui/TablePagination';
import { useToast } from '@/context/ToastContext';
import { notificationsApi } from '../api';
import {
  CATEGORY_LABELS,
  DELIVERY_STATUS_LABELS,
  DELIVERY_STATUS_VARIANTS,
  DESTINATION_LABELS,
  STATUS_LABELS,
  STATUS_VARIANTS,
  audienceSummary,
  breakdown,
  canCancel,
  canEdit,
  describeErrorCode,
  isInFlight,
  outcomeSummary,
} from '../logic';
import type { DeliveryStatus, NotificationCampaign, NotificationDelivery } from '../types';
import { PushPreview } from './PushPreview';

interface DetailModalProps {
  campaignId: string | null;
  onClose: () => void;
  onEdit: (campaign: NotificationCampaign) => void;
  onChanged: () => void;
}

const POLL_MS = 5_000;
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

const DELIVERY_FILTERS: { value: DeliveryStatus | ''; label: string }[] = [
  { value: '', label: 'All attempts' },
  { value: 'failed', label: 'Failed' },
  { value: 'invalid_token', label: 'Invalid token' },
  { value: 'pending', label: 'Waiting / retrying' },
  { value: 'accepted', label: 'Accepted by FCM' },
  { value: 'received', label: 'Received on device' },
];

export function NotificationDetailModal({ campaignId, onClose, onEdit, onChanged }: DetailModalProps) {
  return (
    <Modal
      isOpen={campaignId !== null}
      onClose={onClose}
      title="Notification details"
      description="Delivery status per device. “Accepted” means FCM took the message; it does not prove the phone showed it."
      maxWidth="2xl"
    >
      {campaignId && <Detail key={campaignId} id={campaignId} onClose={onClose} onEdit={onEdit} onChanged={onChanged} />}
    </Modal>
  );
}

function Detail({
  id,
  onClose,
  onEdit,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onEdit: (campaign: NotificationCampaign) => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [campaign, setCampaign] = useState<NotificationCampaign | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<NotificationDelivery[]>([]);
  const [filter, setFilter] = useState<DeliveryStatus | ''>('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const requestId = useRef(0);
  const limit = 10;

  const load = useCallback(async () => {
    const mine = ++requestId.current;
    try {
      const detail = await notificationsApi.get(id);
      const list =
        detail.status === 'draft' || detail.status === 'scheduled' || detail.status === 'cancelled'
          ? null
          : await notificationsApi.listDeliveries(id, { page, limit, ...(filter ? { status: filter } : {}) });
      if (mine !== requestId.current) return;
      setCampaign(detail);
      setDeliveries(list?.items ?? []);
      setTotal(list?.meta?.total ?? 0);
      setTotalPages(list?.meta?.totalPages ?? 1);
      setError(null);
    } catch (err) {
      if (mine === requestId.current) setError(err instanceof Error ? err.message : 'Failed to load the notification.');
    }
  }, [id, page, filter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on open and when paging/filtering
    void load();
  }, [load]);

  const inFlight = campaign ? isInFlight(campaign.status) : false;
  useEffect(() => {
    if (!inFlight) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [inFlight, load]);

  const confirmCancel = async () => {
    if (!campaign || cancelling) return;
    setCancelling(true);
    try {
      await notificationsApi.cancel(campaign.id);
      toast.success('Notification cancelled.');
      setCancelOpen(false);
      onChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel.');
    } finally {
      setCancelling(false);
    }
  };

  if (error && !campaign) return <ErrorState title="Couldn't load this notification" message={error} compact onRetry={() => void load()} />;
  if (!campaign) {
    return (
      <div className="flex h-48 items-center justify-center">
        <LoadingSpinner size="lg" label="Loading…" />
      </div>
    );
  }

  const counts = campaign.deliveries;
  const b = counts ? breakdown(counts) : null;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANTS[campaign.status]}>{STATUS_LABELS[campaign.status]}</Badge>
            <span className="text-xs text-ink-400">{CATEGORY_LABELS[campaign.category]}</span>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <Meta label="Audience" value={audienceSummary(campaign.audience)} />
            <Meta label="Opens" value={campaign.destination ? DESTINATION_LABELS[campaign.destination] : 'App home'} />
            <Meta label="Scheduled for" value={fmt(campaign.scheduledAt)} />
            <Meta label="Started" value={fmt(campaign.startedAt)} />
            <Meta label="Finished" value={fmt(campaign.completedAt ?? campaign.cancelledAt)} />
            <Meta
              label="Reached / skipped"
              value={`${campaign.targetCount - campaign.skippedCount} / ${campaign.skippedCount} (opted out)`}
            />
          </dl>
          <p className="text-sm text-ink-100" aria-live="polite">{outcomeSummary(campaign)}</p>
        </div>
        <PushPreview title={campaign.title} body={campaign.body} destination={campaign.destination} />
      </div>

      {b && counts && counts.total > 0 && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Tile label="Received" value={b.received} tone="text-emerald-300" />
          <Tile label="Accepted by FCM" value={b.accepted} tone="text-cyan-300" />
          <Tile label="In progress" value={b.inProgress} tone="text-amber-300" />
          <Tile label="Failed" value={b.failed} tone="text-rose-300" />
          <Tile label="Dry run" value={b.dryRun} tone="text-ink-300" />
        </dl>
      )}

      {(canEdit(campaign.status) || canCancel(campaign.status)) && (
        <div className="flex flex-wrap gap-2">
          {canEdit(campaign.status) && (
            <button type="button" className="btn btn-secondary" onClick={() => onEdit(campaign)}>
              <Pencil className="h-4 w-4" />
              Edit &amp; send
            </button>
          )}
          {canCancel(campaign.status) && (
            <button type="button" className="btn btn-danger-ghost" onClick={() => setCancelOpen(true)}>
              <Ban className="h-4 w-4" />
              {campaign.status === 'scheduled' ? 'Cancel scheduled send' : 'Cancel'}
            </button>
          )}
        </div>
      )}

      {counts && counts.total > 0 && (
        <section aria-label="Deliveries" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="card-title">Delivery attempts</h3>
            <div>
              <label htmlFor="delivery-filter" className="sr-only">Filter attempts</label>
              <select
                id="delivery-filter"
                className="input w-48"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value as DeliveryStatus | '');
                  setPage(1);
                }}
              >
                {DELIVERY_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="table-shell">
            <div className="table-scroll">
              <table className="data-table min-w-[640px]">
                <thead>
                  <tr>
                    <th scope="col" className="pl-4">User</th>
                    <th scope="col">Status</th>
                    <th scope="col">Attempts</th>
                    <th scope="col" className="pr-4">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-xs text-ink-400">No attempts match this filter.</td>
                    </tr>
                  ) : (
                    deliveries.map((d) => (
                      <tr key={d.id}>
                        <td className="pl-4">
                          <p className="max-w-[14rem] truncate text-sm text-white">{d.userEmail ?? d.userId}</p>
                        </td>
                        <td>
                          <Badge size="sm" variant={DELIVERY_STATUS_VARIANTS[d.status]}>
                            {DELIVERY_STATUS_LABELS[d.status]}
                          </Badge>
                        </td>
                        <td className="tabular-nums">{d.attempts}</td>
                        <td className="pr-4 text-xs text-ink-300">
                          {d.errorCode ? (
                            <>
                              <span className="font-mono text-ink-200">{d.errorCode}</span>
                              <span className="block text-ink-400">{describeErrorCode(d.errorCode)}</span>
                            </>
                          ) : d.receivedAt ? (
                            `Confirmed ${fmt(d.receivedAt)}`
                          ) : d.acceptedAt ? (
                            `Accepted ${fmt(d.acceptedAt)}`
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <TablePagination page={page} totalPages={totalPages} total={total} pageSize={limit} onPageChange={setPage} itemLabel="attempts" />
        </section>
      )}

      <ConfirmDialog
        isOpen={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => void confirmCancel()}
        isBusy={cancelling}
        busyLabel="Cancelling…"
        title="Cancel this notification?"
        description="It will not be sent. If it has already started sending, cancelling is no longer possible."
        confirmLabel="Cancel notification"
      />
      <div className="flex justify-end">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-500">{label}</dt>
      <dd className="truncate text-ink-100" title={value}>{value}</dd>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="card-inset p-3 text-center">
      <dt className="text-[11px] text-ink-400">{label}</dt>
      <dd className={`mt-0.5 text-xl font-semibold tabular-nums ${tone}`}>{value.toLocaleString()}</dd>
    </div>
  );
}
