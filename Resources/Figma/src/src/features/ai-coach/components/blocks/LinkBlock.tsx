import React from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { useNavigation } from '../../../../app/navigation/NavigationContext';
import type { Block } from '../../types/coach';

export function LinkBlock({ block }: {block: Extract<Block, {type: 'link';}>;}) {
  const { navigate } = useNavigation();
  return (
    <button
      type="button"
      onClick={() => navigate(block.route, block.params)}
      className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left transition-colors duration-150 hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30">
      
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold text-ink">{block.label}</span>
        <span className="block text-[12.5px] text-muted">{block.description}</span>
      </span>
      <ChevronRightIcon size={18} className="text-muted" aria-hidden="true" />
    </button>);

}