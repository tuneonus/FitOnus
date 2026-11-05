import React from 'react';
import { InfoIcon, ShieldAlertIcon, TriangleAlertIcon, WifiOffIcon } from 'lucide-react';
import { cn } from '../../utils/cn';

type BannerTone = 'offline' | 'error' | 'warning' | 'info';

type StatusBannerProps = {
  tone: BannerTone;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
};

const config = {
  offline: { icon: WifiOffIcon, wrap: 'bg-ink/[0.06]', icon_: 'text-ink' },
  error: { icon: TriangleAlertIcon, wrap: 'bg-bad/10', icon_: 'text-bad' },
  warning: { icon: ShieldAlertIcon, wrap: 'bg-warn/10', icon_: 'text-warn' },
  info: { icon: InfoIcon, wrap: 'bg-sky/10', icon_: 'text-sky' }
};

export function StatusBanner({ tone, title, body, actionLabel, onAction, className }: StatusBannerProps) {
  const { icon: Icon, wrap, icon_ } = config[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-2xl p-3.5', wrap, className)}>
      
      <Icon size={18} className={cn('mt-0.5 shrink-0', icon_)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-ink">{title}</p>
        {body && <p className="mt-0.5 text-[13px] leading-snug text-muted">{body}</p>}
      </div>
      {actionLabel && onAction &&
      <button
        type="button"
        onClick={onAction}
        className="h-8 shrink-0 rounded-full bg-surface px-3 text-[13px] font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30">
        
          {actionLabel}
        </button>
      }
    </div>);

}