import React from 'react';
import { ChevronRightIcon } from 'lucide-react';

type SectionHeaderProps = {
  id?: string;
  title: string;
  action?: string;
  onAction?: () => void;
};

export function SectionHeader({ id, title, action, onAction }: SectionHeaderProps) {
  return (
    <div className="mb-3 flex items-center justify-between px-1">
      <h2 id={id} className="text-[17px] font-semibold tracking-[-0.01em] text-ink">
        {title}
      </h2>
      {action && onAction &&
      <button
        type="button"
        onClick={onAction}
        className="-mr-1 inline-flex h-8 items-center gap-0.5 rounded-full px-2 text-[13px] font-medium text-muted transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30">
        
          {action}
          <ChevronRightIcon size={14} aria-hidden="true" />
        </button>
      }
    </div>);

}