import React from "react";
import { ChevronRightIcon, BoxIcon } from "lucide-react";
import { cn } from "../../utils/cn";
type ListRowProps = {
  icon?: BoxIcon;
  iconClassName?: string;
  title: string;
  subtitle?: React.ReactNode;
  value?: React.ReactNode;
  trailing?: React.ReactNode;
  onClick?: () => void;
  destructive?: boolean;
  chevron?: boolean;
};
export function ListRow({
  icon: Icon,
  iconClassName,
  title,
  subtitle,
  value,
  trailing,
  onClick,
  destructive,
  chevron
}: ListRowProps) {
  const showChevron = chevron ?? Boolean(onClick);
  const content = <>
      {Icon && <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface2">
          <Icon size={18} className={cn(destructive ? 'text-bad' : 'text-ink', iconClassName)} aria-hidden="true" />
        </span>}
      <span className="min-w-0 flex-1">
        <span className={cn('block text-[15px] font-medium', destructive ? 'text-bad' : 'text-ink')}>
          {title}
        </span>
        {subtitle && <span className="mt-0.5 block text-[12.5px] text-muted">{subtitle}</span>}
      </span>
      {value && <span className="shrink-0 text-right text-[14px] text-muted">{value}</span>}
      {trailing}
      {showChevron && <ChevronRightIcon size={16} className="shrink-0 text-muted" aria-hidden="true" />}
    </>;
  const base = 'flex w-full min-h-[60px] items-center gap-3 px-4 py-3 text-left';
  return onClick ? <button type="button" onClick={onClick} className={cn(base, 'transition-colors duration-150 hover:bg-surface2/60 focus-visible:bg-surface2 focus-visible:outline-none')}>
      {content}
    </button> : <div className={base}>{content}</div>;
}
export function ListGroup({
  children,
  className



}: {children: React.ReactNode;className?: string;}) {
  return <div className={cn('divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface', className)}>
      {children}
    </div>;
}