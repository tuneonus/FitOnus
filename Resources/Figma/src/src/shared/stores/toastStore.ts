import { create } from 'zustand';

export type Toast = {
  id: number;
  message: string;
  tone?: 'success' | 'error' | 'info';
  actionLabel?: string;
  onAction?: () => void;
};

type ToastState = {
  toasts: Toast[];
  show: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
};

let toastId = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: (toast) => {
    const id = ++toastId;
    set({ toasts: [...get().toasts.slice(-1), { ...toast, id }] });
    setTimeout(() => get().dismiss(id), 4200);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) })
}));

export const showToast = (toast: Omit<Toast, 'id'>) => useToastStore.getState().show(toast);