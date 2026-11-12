'use client';

import React from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import type { AdminUserListItem } from '../types';

interface UserStatusActionModalProps {
  targetUser: AdminUserListItem | null;
  actionType: 'suspend' | 'reactivate' | null;
  reason: string;
  onReasonChange: (reason: string) => void;
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function UserStatusActionModal({
  targetUser,
  actionType,
  reason,
  onReasonChange,
  isSubmitting,
  error,
  onClose,
  onConfirm,
}: UserStatusActionModalProps) {
  if (!targetUser || !actionType) return null;

  return (
    <Modal
      isOpen={!!targetUser}
      onClose={onClose}
      title={
        actionType === 'suspend'
          ? 'Suspend user account'
          : 'Reactivate user account'
      }
      description={
        actionType === 'suspend'
          ? 'This will immediately revoke all active sessions and block the user from accessing OnusFit.'
          : 'This will restore full access to OnusFit for this member.'
      }
      footer={
        <>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onConfirm}
            className={`btn ${actionType === 'suspend' ? 'btn-danger' : 'btn-success'}`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Processing…
              </>
            ) : actionType === 'suspend' ? (
              'Suspend account'
            ) : (
              'Reactivate account'
            )}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div role="alert" className="alert alert-error">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="card-inset flex items-center gap-3 p-3">
          <span className="avatar h-9 w-9 text-xs">
            {targetUser.displayName ? targetUser.displayName.slice(0, 2).toUpperCase() : 'US'}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-white">{targetUser.displayName}</p>
            <p className="truncate text-xs text-ink-400">{targetUser.email}</p>
          </div>
        </div>

        <div>
          <label htmlFor="status-action-reason" className="field-label">
            Reason {actionType === 'suspend' ? <span className="text-rose-300">*</span> : <span className="text-ink-500">(optional)</span>}
          </label>
          <input
            id="status-action-reason"
            type="text"
            placeholder={
              actionType === 'suspend'
                ? 'e.g. Terms violation, payment dispute, user requested'
                : 'e.g. Verification complete, dispute resolved'
            }
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            aria-invalid={Boolean(error) && actionType === 'suspend' && !reason.trim()}
            className={`input ${error && actionType === 'suspend' && !reason.trim() ? 'input-invalid' : ''}`}
          />
          <p className="field-hint">Recorded in the audit trail with your admin account.</p>
        </div>
      </div>
    </Modal>
  );
}
