import React from "react";
import { CheckIcon, BoxIcon } from "lucide-react";
import { cn } from "../../utils/cn";
type OptionCardProps = {
  title: string;
  description?: string;
  icon?: BoxIcon;
  selected: boolean;
  onSelect: () => void;
  multi?: boolean;
};
export function OptionCard({
  title,
  description,
  icon: Icon,
  selected,
  onSelect,
  multi
}: OptionCardProps) {
  return <button type="button" role={multi ? 'checkbox' : 'radio'} aria-checked={selected} onClick={onSelect} className={cn('flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30', selected ? 'border-ink bg-surface' : 'border-line bg-surface hover:border-ink/30')}>
      {Icon && <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', selected ? 'bg-accent text-accentInk' : 'bg-surface2 text-ink')}>
          <Icon size={19} aria-hidden="true" />
        </span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-ink">{title}</span>
        {description && <span className="mt-0.5 block text-[13px] leading-snug text-muted">{description}</span>}
      </span>
      <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center border-2 transition-colors duration-150', multi ? 'rounded-md' : 'rounded-full', selected ? 'border-ink bg-ink text-bg' : 'border-line')} aria-hidden="true">
        {selected && <CheckIcon size={14} strokeWidth={3} />}
      </span>
    </button>;
}