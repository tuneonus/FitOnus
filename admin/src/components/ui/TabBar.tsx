'use client';

import React from 'react';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
  count?: number;
  /** Shows an amber dot, e.g. for unsaved changes. */
  dirty?: boolean;
}

interface TabBarProps<T extends string> {
  tabs: TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  ariaLabel: string;
}

/** Underlined section tabs with arrow-key navigation. */
export function TabBar<T extends string>({ tabs, active, onChange, ariaLabel }: TabBarProps<T>) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = (index + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    const buttons = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[next]?.focus();
  };

  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div role="tablist" aria-label={ariaLabel} className="flex min-w-max gap-1 border-b border-ink-800">
        {tabs.map((tab, i) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, i)}
              className={`relative -mb-px inline-flex h-10 items-center gap-2 rounded-t-md border-b-2 px-3 text-[13px] font-medium transition-colors [&>svg]:h-4 [&>svg]:w-4 ${
                isActive
                  ? 'border-brand-500 text-white'
                  : 'border-transparent text-ink-400 hover:border-ink-600 hover:text-ink-100'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.dirty && (
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-label="Unsaved changes" />
              )}
              {tab.count !== undefined && (
                <span
                  className={`rounded px-1.5 py-px text-[11px] tabular-nums ${
                    isActive ? 'bg-brand-500/15 text-brand-300' : 'bg-ink-800 text-ink-400'
                  }`}
                >
                  {tab.count.toLocaleString()}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
