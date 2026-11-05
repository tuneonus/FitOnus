import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { XIcon } from 'lucide-react';
import { useOverlayRoot } from '../../hooks/useOverlayRoot';
import { motionTokens } from '../../theme/tokens';

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function BottomSheet({ open, onClose, title, description, children, footer }: BottomSheetProps) {
  const root = useOverlayRoot();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!root) return null;

  return createPortal(
    <AnimatePresence>
      {open &&
      <div className="absolute inset-0">
          <motion.div
          className="absolute inset-0 bg-black/45"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }} />
        
          <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="absolute inset-x-0 bottom-0 flex max-h-[90%] flex-col rounded-t-[28px] bg-surface text-ink"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ duration: motionTokens.sheet, ease: motionTokens.ease }}>
          
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-ink/15" aria-hidden="true" />
            {title &&
          <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-3">
                <div>
                  <h2 className="text-[19px] font-semibold tracking-[-0.01em]">{title}</h2>
                  {description && <p className="mt-0.5 text-[13.5px] text-muted">{description}</p>}
                </div>
                <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full bg-surface2 text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30">
              
                  <XIcon size={18} aria-hidden="true" />
                </button>
              </div>
          }
            <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-4 pt-2">{children}</div>
            {footer && <div className="border-t border-line px-5 pb-8 pt-3">{footer}</div>}
            {!footer && <div className="h-6" />}
          </motion.div>
        </div>
      }
    </AnimatePresence>,
    root
  );
}