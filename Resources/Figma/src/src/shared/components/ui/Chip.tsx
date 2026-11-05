import React from "react";
import { cn } from "../../utils/cn";
import { BoxIcon } from "lucide-react";
type ChipProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  icon?: BoxIcon;
};
export function Chip({
  selected,
  icon: Icon,
  className,
  children,
  type = 'button',
  ...rest
}: ChipProps) {
  return <button type={type} aria-pressed={selected} className={cn('inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30', selected ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink hover:border-ink/30', className)} {...rest}>
      {Icon && <Icon size={14} aria-hidden="true" />}
      {children}
    </button>;
}