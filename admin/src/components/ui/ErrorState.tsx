import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  title: string;
  message?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
  isRetrying?: boolean;
  compact?: boolean;
}

export function ErrorState({
  title,
  message,
  onRetry,
  retryLabel = 'Try again',
  isRetrying,
  compact = false,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={`flex flex-col gap-4 rounded-xl border border-rose-500/25 bg-rose-500/[0.06] sm:flex-row sm:items-start ${
        compact ? 'p-4' : 'p-5 sm:p-6'
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/25">
        <AlertTriangle className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {message && <p className="mt-1 break-words text-[13px] leading-relaxed text-rose-200/80">{message}</p>}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={isRetrying}
            className="btn btn-secondary btn-sm mt-4"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
            {retryLabel}
          </button>
        )}
      </div>
    </div>
  );
}
