import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useOverlayRoot } from '../../hooks/useOverlayRoot';
import { Button } from './Button';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const root = useOverlayRoot();
  if (!root) return null;

  return createPortal(
    <AnimatePresence>
      {open &&
      <div className="absolute inset-0 flex items-center justify-center p-6">
          <motion.div
          className="absolute inset-0 bg-black/50"
          onClick={onCancel}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }} />
        
          <motion.div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          className="relative w-full rounded-[28px] bg-surface p-6 text-ink"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}>
          
            <h2 id="confirm-title" className="text-[19px] font-semibold tracking-[-0.01em]">
              {title}
            </h2>
            <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{message}</p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={onCancel}>
                {cancelLabel}
              </Button>
              <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </div>
          </motion.div>
        </div>
      }
    </AnimatePresence>,
    root
  );
}