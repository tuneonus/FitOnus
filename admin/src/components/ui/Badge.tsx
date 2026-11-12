import React from 'react';

type BadgeVariant =
  | 'active'
  | 'disabled'
  | 'completed'
  | 'pending'
  | 'admin'
  | 'member'
  | 'neutral'
  | 'warning'
  | 'info';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  className?: string;
  /** Hide the leading status dot. */
  plain?: boolean;
}

const VARIANT_STYLES: Record<BadgeVariant, { chip: string; dot: string }> = {
  active: { chip: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25', dot: 'bg-emerald-400' },
  disabled: { chip: 'bg-rose-500/10 text-rose-300 ring-rose-500/25', dot: 'bg-rose-400' },
  completed: { chip: 'bg-brand-500/10 text-brand-300 ring-brand-500/25', dot: 'bg-brand-500' },
  pending: { chip: 'bg-amber-500/10 text-amber-300 ring-amber-500/25', dot: 'bg-amber-400' },
  admin: { chip: 'bg-purple-500/10 text-purple-300 ring-purple-500/25', dot: 'bg-purple-400' },
  member: { chip: 'bg-ink-800 text-ink-200 ring-ink-700', dot: 'bg-ink-400' },
  neutral: { chip: 'bg-ink-800 text-ink-300 ring-ink-700', dot: 'bg-ink-500' },
  warning: { chip: 'bg-amber-500/10 text-amber-300 ring-amber-500/25', dot: 'bg-amber-400' },
  info: { chip: 'bg-cyan-500/10 text-cyan-300 ring-cyan-500/25', dot: 'bg-cyan-400' },
};

export function Badge({
  children,
  variant = 'neutral',
  size = 'md',
  className = '',
  plain = false,
}: BadgeProps) {
  const styles = VARIANT_STYLES[variant];
  const sizeStyles = {
    sm: 'h-5 px-1.5 text-[11px]',
    md: 'h-6 px-2 text-xs',
  };

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md font-medium capitalize ring-1 ring-inset ${styles.chip} ${sizeStyles[size]} ${className}`}
    >
      {!plain && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />}
      {children}
    </span>
  );
}
