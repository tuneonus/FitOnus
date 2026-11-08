'use client';

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { ToastContainer } from '@/components/ui/Toast';
import type { ToastItem, ToastType } from '@/components/ui/Toast';

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
  };
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    ({ type, title, message, duration = 4000 }: Omit<ToastItem, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const newToast: ToastItem = { id, type, title, message, duration };

      setToasts((prev) => [...prev, newToast]);

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
