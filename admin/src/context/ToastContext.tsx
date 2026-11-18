'use client';

import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';
import { ToastContainer } from '@/components/ui/Toast';
import type { ToastItem, ToastType } from '@/components/ui/Toast';
import { normalizeAdminApiError } from '@/lib/error-normalizer';

export type { ToastItem, ToastType };

export interface ToastOptions {
  title?: string;
  duration?: number;
}

export interface ToastContextValue {
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, 'id'>) => string;
  removeToast: (id: string) => void;
  toast: {
    success: (message: string, options?: ToastOptions) => string;
    error: (message: string, options?: ToastOptions) => string;
    warning: (message: string, options?: ToastOptions) => string;
    info: (message: string, options?: ToastOptions) => string;
    fromError: (error: unknown, fallback?: string, options?: ToastOptions) => string;
  };
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const MAX_STACKED_TOASTS = 3;
const DEDUPLICATION_WINDOW_MS = 2500;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const recentToastsRef = useRef<Map<string, number>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    ({ type, title, message, duration = 4000 }: Omit<ToastItem, 'id'>) => {
      // Clean and sanitize message string
      let cleanMessage = typeof message === 'string' ? message.trim() : '';
      if (!cleanMessage) {
        cleanMessage = type === 'error' ? 'An error occurred. Please try again.' : 'Action completed.';
      }

      // Deduplication: prevent stacking identical messages within 2.5s
      const dedupeKey = `${type}:${title ?? ''}:${cleanMessage}`;
      const now = Date.now();
      const lastSeen = recentToastsRef.current.get(dedupeKey);
      if (lastSeen && now - lastSeen < DEDUPLICATION_WINDOW_MS) {
        return '';
      }
      recentToastsRef.current.set(dedupeKey, now);

      // Clean old keys from map periodically
      if (recentToastsRef.current.size > 20) {
        for (const [k, time] of recentToastsRef.current.entries()) {
          if (now - time > 10000) recentToastsRef.current.delete(k);
        }
      }

      const id = `${now}-${Math.random().toString(36).slice(2, 9)}`;
      const newToast: ToastItem = { id, type, title, message: cleanMessage, duration };

      // Limit stacked toasts to MAX_STACKED_TOASTS
      setToasts((prev) => [...prev.slice(-(MAX_STACKED_TOASTS - 1)), newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }

      return id;
    },
    [removeToast],
  );

  const toastMethods = useMemo(
    () => ({
      success: (message: string, options?: ToastOptions) =>
        addToast({ type: 'success', message, ...options }),
      error: (message: string, options?: ToastOptions) =>
        addToast({ type: 'error', message, ...options }),
      warning: (message: string, options?: ToastOptions) =>
        addToast({ type: 'warning', message, ...options }),
      info: (message: string, options?: ToastOptions) =>
        addToast({ type: 'info', message, ...options }),
      fromError: (error: unknown, fallback?: string, options?: ToastOptions) => {
        const normalized = normalizeAdminApiError(error, fallback);
        return addToast({
          type: normalized.tone,
          message: normalized.userMessage,
          ...options,
        });
      },
    }),
    [addToast],
  );

  const value = useMemo(
    () => ({
      toasts,
      addToast,
      removeToast,
      toast: toastMethods,
    }),
    [toasts, addToast, removeToast, toastMethods],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
