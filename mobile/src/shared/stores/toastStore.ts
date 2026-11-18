import { create } from 'zustand';
import { normalizeMobileApiError } from '../../services/error-normalizer';

export type Toast = {
  id: number;
  message: string;
  tone?: 'success' | 'error' | 'warning' | 'info' | undefined;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
};

type ToastState = {
  toasts: Toast[];
  show: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
  clear: () => void;
};

let toastId = 0;
const DEDUPLICATION_WINDOW_MS = 2500;
const lastToastTimes = new Map<string, number>();

function sanitizeMessage(msg: unknown): string {
  if (typeof msg !== 'string') {
    return 'Notification';
  }
  const trimmed = msg.trim();
  if (
    !trimmed ||
    trimmed.includes('[object Object]') ||
    trimmed === 'undefined' ||
    trimmed === 'null' ||
    trimmed.startsWith('Error: [object')
  ) {
    return 'Something went wrong. Please try again.';
  }
  if (trimmed === 'Network Error' || trimmed.includes('Network Error') || trimmed.includes('Failed to fetch')) {
    return 'Unable to connect. Check your internet connection.';
  }
  if (trimmed.includes('status code 5')) {
    return 'Something went wrong. Please try again.';
  }
  if (trimmed.toLowerCase().includes('timeout') || trimmed.toLowerCase().includes('econnaborted')) {
    return 'Request timed out. Please try again.';
  }
  return trimmed;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: (toast) => {
    const cleanMessage = sanitizeMessage(toast.message);
    const tone = toast.tone || 'info';
    const key = `${tone}:${cleanMessage}`;
    const now = Date.now();

    // Deduplication: drop duplicate toast within 2.5 seconds
    const lastTime = lastToastTimes.get(key);
    if (lastTime && now - lastTime < DEDUPLICATION_WINDOW_MS) {
      return;
    }
    lastToastTimes.set(key, now);

    const id = ++toastId;
    // Limit stacked notifications to three
    const current = get().toasts;
    const trimmed = current.length >= 3 ? current.slice(current.length - 2) : current;

    set({
      toasts: [...trimmed, { ...toast, message: cleanMessage, tone, id }],
    });

    setTimeout(() => {
      get().dismiss(id);
    }, 4200);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  clear: () => {
    lastToastTimes.clear();
    set({ toasts: [] });
  },
}));

export function showToastFromError(error: unknown, fallback?: string): void {
  const normalized = normalizeMobileApiError(error, fallback);
  useToastStore.getState().show({
    message: normalized.userMessage,
    tone: normalized.tone,
  });
}

export const showToast = (toast: Omit<Toast, 'id'>) => useToastStore.getState().show(toast);

showToast.fromError = showToastFromError;
showToast.success = (message: string, options?: Partial<Omit<Toast, 'id' | 'message' | 'tone'>>) =>
  showToast({ message, tone: 'success', ...options });
showToast.error = (message: string, options?: Partial<Omit<Toast, 'id' | 'message' | 'tone'>>) =>
  showToast({ message, tone: 'error', ...options });
showToast.warning = (message: string, options?: Partial<Omit<Toast, 'id' | 'message' | 'tone'>>) =>
  showToast({ message, tone: 'warning', ...options });
showToast.info = (message: string, options?: Partial<Omit<Toast, 'id' | 'message' | 'tone'>>) =>
  showToast({ message, tone: 'info', ...options });
