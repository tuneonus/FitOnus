'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
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
          ? 'Suspend User Account'
          : 'Reactivate User Account'
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
            className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onConfirm}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-lg transition-colors ${
              actionType === 'suspend'
                ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20'
                : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Processing...</span>
              </>
            ) : actionType === 'suspend' ? (
              <span>Confirm Suspension</span>
            ) : (
              <span>Confirm Reactivation</span>
            )}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-xs">
        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-rose-300 font-medium">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <span className="text-slate-400">Target User:</span>
          <p className="font-semibold text-white mt-0.5">
            {targetUser.displayName} ({targetUser.email})
          </p>
        </div>

        <div>
          <label className="block text-slate-300 font-medium mb-1.5">
            Reason for this action (Recorded in Audit Trail):
          </label>
          <input
            type="text"
            placeholder={
              actionType === 'suspend'
                ? 'e.g. Terms violation, payment dispute, user requested'
                : 'e.g. Verification complete, dispute resolved'
            }
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none"
          />
        </div>
      </div>
    </Modal>
  );
}

