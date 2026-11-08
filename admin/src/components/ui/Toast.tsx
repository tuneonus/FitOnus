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

const TOAST_STYLES: Record<
  ToastType,
  {
    container: string;
    icon: string;
    title: string;
    text: string;
    dismiss: string;
    defaultTitle: string;
  }
> = {
  success: {
    container: 'border-emerald-500/30 bg-slate-900/95 shadow-emerald-500/10 text-emerald-300',
    icon: 'text-emerald-400',
    title: 'text-emerald-300',
    text: 'text-slate-300',
    dismiss: 'text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/10',
    defaultTitle: 'Success',
  },
  error: {
    container: 'border-rose-500/30 bg-slate-900/95 shadow-rose-500/10 text-rose-300',
    icon: 'text-rose-400',
    title: 'text-rose-300',
    text: 'text-slate-300',
    dismiss: 'text-slate-400 hover:text-rose-300 hover:bg-rose-500/10',
    defaultTitle: 'Error',
  },
  warning: {
    container: 'border-amber-500/30 bg-slate-900/95 shadow-amber-500/10 text-amber-300',
    icon: 'text-amber-400',
    title: 'text-amber-300',
    text: 'text-slate-300',
    dismiss: 'text-slate-400 hover:text-amber-300 hover:bg-amber-500/10',
    defaultTitle: 'Warning',
  },
  info: {
    container: 'border-teal-500/30 bg-slate-900/95 shadow-teal-500/10 text-teal-300',
    icon: 'text-teal-400',
    title: 'text-teal-300',
    text: 'text-slate-300',
    dismiss: 'text-slate-400 hover:text-teal-300 hover:bg-teal-500/10',
    defaultTitle: 'Information',
  },
};

export function Toast({ toast, onDismiss }: ToastProps) {
  const styles = TOAST_STYLES[toast.type];
  const Icon = TOAST_ICONS[toast.type];
  const role = toast.type === 'error' || toast.type === 'warning' ? 'alert' : 'status';

  return (
    <div
      role={role}
      aria-live="polite"
      className={`pointer-events-auto flex w-full items-start gap-3 rounded-xl border p-3.5 shadow-xl backdrop-blur-md transition-all duration-200 animate-in fade-in slide-in-from-top-2 ${styles.container}`}
    >
      <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${styles.icon}`} />
      <div className="flex-1 min-w-0 pr-1">
        {toast.title && (
          <p className={`text-xs font-semibold tracking-wide ${styles.title}`}>
            {toast.title}
          </p>
        )}
        <p className={`text-xs leading-relaxed ${styles.text}`}>
          {toast.message}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className={`shrink-0 rounded-lg p-1 transition-colors ${styles.dismiss}`}
      >
        <X className="h-4 w-4" />
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
      className="fixed top-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none sm:top-6 sm:right-6"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
