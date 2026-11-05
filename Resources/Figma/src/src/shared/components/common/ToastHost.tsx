import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon } from 'lucide-react';
import { useToastStore } from '../../stores/toastStore';

export function ToastHost({ raised }: {raised: boolean;}) {
  const { toasts, dismiss } = useToastStore();
  const toast = toasts[toasts.length - 1];
  const Icon = toast?.tone === 'error' ? TriangleAlertIcon : toast?.tone === 'info' ? InfoIcon : CircleCheckIcon;

  return (
    <div
      className={`pointer-events-none absolute inset-x-4 z-40 ${raised ? 'bottom-[112px]' : 'bottom-10'}`}
      aria-live="polite">
      
      <AnimatePresence>
        {toast &&
        <motion.div
          key={toast.id}
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-ink py-2.5 pl-4 pr-2 text-bg shadow-lg">
          
            <Icon
            size={18}
            className={toast.tone === 'error' ? 'text-bad' : 'text-accent'}
            aria-hidden="true" />
          
            <p className="min-w-0 flex-1 text-[14px] font-medium">{toast.message}</p>
            {toast.actionLabel && toast.onAction ?
          <button
            type="button"
            onClick={() => {
              toast.onAction?.();
              dismiss(toast.id);
            }}
            className="h-9 rounded-xl px-3 text-[14px] font-semibold text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            
                {toast.actionLabel}
              </button> :

          <span className="w-2" />
          }
          </motion.div>
        }
      </AnimatePresence>
    </div>);

}