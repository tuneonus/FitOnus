'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import {
  Shield,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  Copy,
  Check,
  Lock,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { ApiError } from '@/lib/api-client';
import { authApi } from '../api';
import type { AdminUser } from '../types';

interface AdminAccountSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AdminUser | null;
}

export function AdminAccountSettingsModal({
  isOpen,
  onClose,
  user,
}: AdminAccountSettingsModalProps) {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Client-side validations
  const isMinLength = newPassword.length >= 12;
  const isDifferentFromCurrent =
    newPassword.length > 0 && currentPassword.length > 0 && newPassword !== currentPassword;
  const isMatching = newPassword.length > 0 && newPassword === confirmPassword;

  const canSubmit =
    currentPassword.trim().length > 0 &&
    isMinLength &&
    isDifferentFromCurrent &&
    isMatching &&
    !isSubmitting;

  const handleCopyId = () => {
    if (!user?.id) return;
    navigator.clipboard.writeText(user.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleResetForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setFormError(null);
  };

  const handleClose = () => {
    handleResetForm();
    onClose();
  };

  const handleSubmitPassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      const res = await authApi.changePassword({
        currentPassword,
        newPassword,
      });

      const revokedNotice =
        res.revokedSessions > 0
          ? ` (${res.revokedSessions} other active session${res.revokedSessions === 1 ? '' : 's'} revoked)`
          : '';
      toast.success(`Admin password updated successfully.${revokedNotice}`);
      handleResetForm();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 422 || err.code === 'INVALID_CREDENTIALS') {
          setFormError('The current password entered is incorrect.');
          toast.error('The current password entered is incorrect.');
        } else if (err.status === 429 || err.code === 'RATE_LIMITED') {
          setFormError('Too many password update attempts. Please try again later.');
          toast.error('Too many password update attempts. Please try again later.');
        } else {
          setFormError(err.message);
          toast.error(err.message);
        }
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to update password.';
        setFormError(msg);
        toast.error(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Admin Account & Security Settings"
      description="View administrator profile credentials and evaluate password security posture."
      maxWidth="lg"
    >
      <div className="space-y-6">
        {/* Administrator Profile Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500/20 to-emerald-500/20 border border-teal-500/40 text-teal-300 font-bold text-base shadow-sm shadow-teal-500/10">
                {user?.displayName
                  ? user.displayName.slice(0, 2).toUpperCase()
                  : user?.email
                  ? user.email.slice(0, 2).toUpperCase()
                  : 'AD'}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-semibold text-white">
                    {user?.displayName || 'System Administrator'}
                  </h4>
                  <span className="inline-flex items-center gap-1 rounded-full bg-teal-500/10 border border-teal-500/30 px-2 py-0.5 text-[10px] font-semibold text-teal-300 uppercase tracking-wider">
                    <Shield className="h-3 w-3" />
                    {user?.role || 'Admin'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5 truncate">{user?.email}</p>
              </div>
            </div>

            {/* Account ID badge with copy */}
            {user?.id && (
              <div className="flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1 text-xs">
                <span className="text-[11px] text-slate-500 font-mono">ID:</span>
                <span className="font-mono text-[11px] text-slate-300 max-w-[120px] truncate">
                  {user.id}
                </span>
                <button
                  type="button"
                  onClick={handleCopyId}
                  title="Copy Account ID"
                  className="text-slate-400 hover:text-white transition-colors p-0.5"
                >
                  {copiedId ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Permissions Pill Grid */}
          {user?.permissions && user.permissions.length > 0 && (
            <div className="mt-4 pt-3.5 border-t border-slate-800/80">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Granted System Permissions
              </p>
              <div className="flex flex-wrap gap-1.5">
                {user.permissions.map((perm) => (
                  <span
                    key={perm}
                    className="rounded-md border border-slate-800 bg-slate-950/80 px-2 py-0.5 text-[10px] font-mono text-slate-300"
                  >
                    {perm}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Password Security Form */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-4">
            <KeyRound className="h-4 w-4 text-teal-400" />
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
              Password Security Management
            </h4>
          </div>

          <div className="space-y-3.5">
            {/* Current Password */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Current Password
              </label>
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current administrative password"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3.5 py-2.5 pr-10 text-xs text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                >
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 12 characters"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3.5 py-2.5 pr-10 text-xs text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3.5 py-2.5 pr-10 text-xs text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Live Requirements Checklist */}
            <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-3 text-xs space-y-1.5">
              <p className="text-[11px] font-semibold text-slate-400 mb-1">
                Password Security Checklist:
              </p>
              <div className="flex items-center gap-2">
                {isMinLength ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <div className="h-3.5 w-3.5 rounded-full border border-slate-600 shrink-0" />
                )}
                <span className={isMinLength ? 'text-emerald-300' : 'text-slate-400'}>
                  At least 12 characters in length
                </span>
              </div>
              <div className="flex items-center gap-2">
                {isDifferentFromCurrent ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <div className="h-3.5 w-3.5 rounded-full border border-slate-600 shrink-0" />
                )}
                <span className={isDifferentFromCurrent ? 'text-emerald-300' : 'text-slate-400'}>
                  Different from current password
                </span>
              </div>
              <div className="flex items-center gap-2">
                {isMatching ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <div className="h-3.5 w-3.5 rounded-full border border-slate-600 shrink-0" />
                )}
                <span className={isMatching ? 'text-emerald-300' : 'text-slate-400'}>
                  Passwords match
                </span>
              </div>
            </div>

            {/* Security Enforcement Notice */}
            <div className="flex items-start gap-2.5 rounded-xl border border-teal-500/20 bg-teal-500/10 p-3.5 text-xs text-teal-300">
              <Lock className="h-4 w-4 shrink-0 mt-0.5 text-teal-400" />
              <div>
                <span className="font-semibold">Security Enforcement: </span>
                Updating your password immediately signs out all other active admin sessions across all devices while preserving your current session.
              </div>
            </div>

            {/* Error Banner */}
            {formError && (
              <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
                <span className="flex-1">{formError}</span>
              </div>
            )}

            {/* Submit Action */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleSubmitPassword}
                disabled={!canSubmit}
                className="w-full rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 py-2.5 px-4 text-xs font-semibold text-slate-950 hover:from-teal-400 hover:to-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-teal-500/20 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Updating Password...</span>
                  </>
                ) : (
                  <span>Update Password</span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
