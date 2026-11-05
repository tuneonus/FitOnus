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
}

export function Badge({
  children,
  variant = 'neutral',
  size = 'md',
  className = '',
}: BadgeProps) {
  const variantStyles: Record<BadgeVariant, string> = {
    active: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    disabled: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
    completed: 'bg-teal-500/10 text-teal-300 border border-teal-500/20',
    pending: 'bg-amber-500/10 text-amber-300 border border-amber-500/20',
    admin: 'bg-purple-500/10 text-purple-300 border border-purple-500/20',
    member: 'bg-slate-500/10 text-slate-300 border border-slate-500/20',
    neutral: 'bg-slate-800 text-slate-300 border border-slate-700',
    warning: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    info: 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20',
  };

  const sizeStyles = {
    sm: 'text-xs px-2 py-0.5 rounded-md font-medium',
    md: 'text-xs px-2.5 py-1 rounded-full font-medium tracking-wide',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {children}
    </span>
  );
}

