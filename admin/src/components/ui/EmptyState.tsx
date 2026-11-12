import React from 'react';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  /** Render without the dashed frame, e.g. inside a card that already has one. */
  bare?: boolean;
}

export function EmptyState({ icon, title, description, action, bare = false }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center px-6 py-12 text-center ${
        bare ? '' : 'rounded-xl border border-dashed border-ink-700 bg-ink-900/50'
      }`}
    >
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-ink-800 text-ink-300 ring-1 ring-ink-700 [&>svg]:h-5 [&>svg]:w-5">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-ink-400">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
