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
      title="Audit Log Event Details"
      description="Comprehensive audit record with full payload and caller metadata"
      maxWidth="lg"
    >
      <div className="space-y-4 text-xs">
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3.5">
          <div>
            <span className="text-slate-500 uppercase tracking-wider text-[10px] font-semibold">
              Action
            </span>
            <div className="mt-1">
              <AuditLogActionBadge action={log.action} />
            </div>
          </div>
          <div>
            <span className="text-slate-500 uppercase tracking-wider text-[10px] font-semibold">
              Event ID
            </span>
            <p className="font-mono text-[11px] text-slate-300 mt-1">{log.id}</p>
          </div>
          <div>
            <span className="text-slate-500 uppercase tracking-wider text-[10px] font-semibold">
              Administrator
            </span>
            <p className="font-semibold text-white mt-1">
              {log.adminName || 'Admin'} ({log.adminEmail})
            </p>
          </div>
          <div>
            <span className="text-slate-500 uppercase tracking-wider text-[10px] font-semibold">
              Target Account
            </span>
            <p className="font-medium text-slate-300 mt-1">
              {log.targetUserEmail || log.targetUserId || 'None'}
            </p>
          </div>
          <div>
            <span className="text-slate-500 uppercase tracking-wider text-[10px] font-semibold">
              IP Address
            </span>
            <p className="font-mono text-slate-300 mt-1">
              {log.ipAddress || 'Internal'}
            </p>
          </div>
          <div>
            <span className="text-slate-500 uppercase tracking-wider text-[10px] font-semibold">
              Timestamp
            </span>
            <p className="text-slate-300 mt-1">
              {new Date(log.createdAt).toLocaleString()}
            </p>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2 text-slate-400">
            <Terminal className="h-4 w-4 text-teal-400" />
            <span className="font-semibold text-white">
              Event Payload & Metadata (JSON)
            </span>
          </div>
          <pre className="rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-[11px] text-teal-300 overflow-x-auto">
            {JSON.stringify(log.details, null, 2)}
          </pre>
        </div>
      </div>
    </Modal>
  );
}

