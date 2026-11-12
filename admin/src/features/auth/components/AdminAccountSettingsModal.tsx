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
      title="Account & security"
      description="View administrator profile credentials and evaluate password security posture."
      maxWidth="lg"
    >
      <div className="space-y-6">
        {/* Administrator Profile Card */}
        <div className="card-inset p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="avatar h-12 w-12 rounded-xl text-sm text-brand-300">
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
                  <span className="inline-flex h-5 items-center gap-1 rounded-md bg-brand-500/10 px-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand-300 ring-1 ring-inset ring-brand-500/25">
                    <Shield className="h-3 w-3" />
                    {user?.role || 'Admin'}
                  </span>
                </div>
                <p className="text-xs text-ink-400 mt-0.5 truncate">{user?.email}</p>
              </div>
            </div>

            {/* Account ID badge with copy */}
            {user?.id && (
              <div className="flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-ink-800 bg-ink-950/60 px-2.5 py-1 text-xs">
                <span className="text-[11px] text-ink-500 font-mono">ID:</span>
                <span className="font-mono text-[11px] text-ink-300 max-w-[120px] truncate">
                  {user.id}
                </span>
                <button
                  type="button"
                  onClick={handleCopyId}
                  title="Copy account ID"
                  aria-label="Copy account ID"
                  className="rounded p-0.5 text-ink-400 transition-colors hover:bg-ink-800 hover:text-white"
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
            <div className="mt-4 pt-3.5 border-t border-ink-800">
              <p className="eyebrow mb-2">
                Granted System Permissions
              </p>
              <div className="flex flex-wrap gap-1.5">
                {user.permissions.map((perm) => (
                  <span
                    key={perm}
                    className="rounded-md bg-ink-800 px-1.5 py-0.5 font-mono text-[11px] text-ink-300 ring-1 ring-inset ring-ink-700"
                  >
                    {perm}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Password Security Form */}
        <div className="rounded-lg border border-ink-800 p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-4">
            <KeyRound className="h-4 w-4 text-ink-400" />
            <h4 className="text-[13px] font-semibold text-white">
              Password Security Management
            </h4>
          </div>

          <div className="space-y-3.5">
            {/* Current Password */}
            <div>
              <label htmlFor="account-password-1" className="field-label">
                Current Password
              </label>
              <div className="relative">
                <input
                  id="account-password-1"
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current administrative password"
                  className="input pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  aria-label={showCurrent ? 'Hide current password' : 'Show current password'}
                  className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-400 hover:bg-ink-800 hover:text-ink-200"
                >
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label htmlFor="account-password-2" className="field-label">
                New Password
              </label>
              <div className="relative">
                <input
                  id="account-password-2"
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 12 characters"
                  className="input pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  aria-label={showNew ? 'Hide new password' : 'Show new password'}
                  className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-400 hover:bg-ink-800 hover:text-ink-200"
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div>
              <label htmlFor="account-password-3" className="field-label">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  id="account-password-3"
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="input pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  aria-label={showConfirm ? 'Hide password confirmation' : 'Show password confirmation'}
                  className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-400 hover:bg-ink-800 hover:text-ink-200"
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Live Requirements Checklist */}
            <div className="card-inset space-y-1.5 p-3 text-xs">
              <p className="text-[11px] font-semibold text-ink-400 mb-1">
                Password Security Checklist:
              </p>
              <div className="flex items-center gap-2">
                {isMinLength ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <div className="h-3.5 w-3.5 rounded-full border border-ink-600 shrink-0" />
                )}
                <span className={isMinLength ? 'text-emerald-300' : 'text-ink-400'}>
                  At least 12 characters in length
                </span>
              </div>
              <div className="flex items-center gap-2">
                {isDifferentFromCurrent ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <div className="h-3.5 w-3.5 rounded-full border border-ink-600 shrink-0" />
                )}
                <span className={isDifferentFromCurrent ? 'text-emerald-300' : 'text-ink-400'}>
                  Different from current password
                </span>
              </div>
              <div className="flex items-center gap-2">
                {isMatching ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <div className="h-3.5 w-3.5 rounded-full border border-ink-600 shrink-0" />
                )}
                <span className={isMatching ? 'text-emerald-300' : 'text-ink-400'}>
                  Passwords match
                </span>
              </div>
            </div>

            {/* Security Enforcement Notice */}
            <div className="alert alert-info text-xs">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
              <div>
                <span className="font-semibold">Security Enforcement: </span>
                Updating your password immediately signs out all other active admin sessions across all devices while preserving your current session.
              </div>
            </div>

            {/* Error Banner */}
            {formError && (
              <div className="alert alert-error">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="flex-1">{formError}</span>
              </div>
            )}

            {/* Submit Action */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleSubmitPassword}
                disabled={!canSubmit}
                className="btn btn-primary w-full justify-center"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Updating Password...</span>
                  </>
                ) : (
                  <span>Update password</span>
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
            className="btn btn-secondary"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
