import React from "react";
import { Button } from "./Button";
import { BoxIcon } from "lucide-react";
type EmptyStateProps = {
  icon: BoxIcon;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
};
export function EmptyState({
  icon: Icon,
  title,
  body,
  actionLabel,
  onAction,
  compact
}: EmptyStateProps) {
  return <div className={`flex flex-col items-center text-center ${compact ? 'px-4 py-8' : 'px-8 py-14'}`}>
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface2">
        <Icon size={24} className="text-ink" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-[17px] font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-[280px] text-[14px] leading-relaxed text-muted">{body}</p>
      {actionLabel && onAction && <Button className="mt-5" onClick={onAction}>
          {actionLabel}
        </Button>}
    </div>;
}