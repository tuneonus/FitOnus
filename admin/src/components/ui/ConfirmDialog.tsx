'use client';

import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  isBusy?: boolean;
  tone?: 'danger' | 'primary' | 'warning';
}

/** Standard confirmation dialog used for destructive or state-changing actions. */
export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  children,
  confirmLabel,
  busyLabel = 'Working…',
  isBusy = false,
  tone = 'danger',
}: ConfirmDialogProps) {
  const confirmClass =
    tone === 'danger'
      ? 'btn-danger'
      : tone === 'warning'
        ? 'bg-amber-500 text-amber-950 hover:bg-amber-400'
        : 'btn-primary';
  const alertClass =
    tone === 'danger' ? 'alert-error' : tone === 'warning' ? 'alert-warning' : 'alert-info';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={description}
      maxWidth="sm"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={isBusy} className="btn btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isBusy}
            className={`btn ${confirmClass}`}
          >
            {isBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isBusy ? busyLabel : confirmLabel}
          </button>
        </>
      }
    >
      {children && (
        <div className={`alert ${alertClass}`}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">{children}</div>
        </div>
      )}
    </Modal>
  );
}
