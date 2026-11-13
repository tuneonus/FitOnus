'use client';

import React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

const TOAST_ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const TOAST_STYLES: Record<ToastType, { accent: string; icon: string }> = {
  success: { accent: 'bg-emerald-400', icon: 'text-emerald-400' },
  error: { accent: 'bg-rose-400', icon: 'text-rose-400' },
  warning: { accent: 'bg-amber-400', icon: 'text-amber-400' },
  info: { accent: 'bg-brand-500', icon: 'text-brand-300' },
};

export function Toast({ toast, onDismiss }: ToastProps) {
  const styles = TOAST_STYLES[toast.type];
  const Icon = TOAST_ICONS[toast.type];
  const role = toast.type === 'error' || toast.type === 'warning' ? 'alert' : 'status';

  return (
    <div
      role={role}
      aria-live={role === 'alert' ? 'assertive' : 'polite'}
      className="pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-lg border border-ink-700 bg-ink-850/95 py-3 pl-4 pr-2.5 shadow-pop backdrop-blur-md"
    >
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-[3px] ${styles.accent}`} />
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${styles.icon}`} />
      <div className="min-w-0 flex-1 pr-1">
        {toast.title && (
          <p className="text-[13px] font-semibold text-white">{toast.title}</p>
        )}
        <p className={`text-[13px] leading-relaxed ${toast.title ? 'mt-0.5 text-ink-300' : 'text-ink-100'}`}>
          {toast.message}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="btn btn-ghost h-6 w-6 shrink-0 rounded-md px-0 text-ink-400"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-4 top-4 z-[70] flex flex-col gap-2 sm:inset-x-auto sm:right-6 sm:top-6 sm:w-full sm:max-w-sm"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
