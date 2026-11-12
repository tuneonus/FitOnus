'use client';

import React from 'react';
import { Terminal } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { AuditLogActionBadge } from './AuditLogActionBadge';
import type { AuditLogItem } from '../types';

interface AuditLogDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  log: AuditLogItem | null;
}

export function AuditLogDetailModal({
  isOpen,
  onClose,
  log,
}: AuditLogDetailModalProps) {
  if (!log) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Audit event"
      description="Full audit record with payload and caller metadata."
      maxWidth="lg"
    >
      <div className="space-y-5 text-[13px]">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-4 rounded-lg border border-ink-800 p-4 sm:grid-cols-2">
          <div>
            <dt className="eyebrow">
              Action
            </dt>
            <div className="mt-1">
              <AuditLogActionBadge action={log.action} />
            </div>
          </div>
          <div>
            <dt className="eyebrow">
              Event ID
            </dt>
            <p className="mt-1 break-all font-mono text-xs text-ink-300">{log.id}</p>
          </div>
          <div>
            <dt className="eyebrow">
              Administrator
            </dt>
            <p className="mt-1 break-words font-medium text-white">
              {log.adminName || 'Admin'} ({log.adminEmail})
            </p>
          </div>
          <div>
            <dt className="eyebrow">
              Target Account
            </dt>
            <p className="mt-1 break-words text-ink-200">
              {log.targetUserEmail || log.targetUserId || 'None'}
            </p>
          </div>
          <div>
            <dt className="eyebrow">
              IP Address
            </dt>
            <p className="mt-1 font-mono text-ink-200">
              {log.ipAddress || 'Internal'}
            </p>
          </div>
          <div>
            <dt className="eyebrow">
              Timestamp
            </dt>
            <p className="mt-1 tabular-nums text-ink-200">
              {new Date(log.createdAt).toLocaleString()}
            </p>
          </div>
        </dl>

        <div>
          <div className="mb-2 flex items-center gap-2 text-ink-400">
            <Terminal className="h-4 w-4 text-ink-400" />
            <span className="font-semibold text-white">
              Payload (JSON)
            </span>
          </div>
          <pre className="max-h-80 overflow-auto rounded-lg border border-ink-800 bg-ink-950 p-4 font-mono text-xs leading-relaxed text-ink-200">
            {JSON.stringify(log.details, null, 2)}
          </pre>
        </div>
      </div>
    </Modal>
  );
}

