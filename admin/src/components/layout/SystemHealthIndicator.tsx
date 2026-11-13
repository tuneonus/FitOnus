'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { checkBackendHealth, type SystemHealthStatus } from '@/lib/system-health';

const STATUS_CONFIG = {
  healthy: {
    dotBg: 'bg-emerald-500',
    pingBg: 'bg-emerald-400',
    textColor: 'text-emerald-300',
    label: 'Online',
    borderColor: 'border-emerald-500/20',
  },
  degraded: {
    dotBg: 'bg-amber-500',
    pingBg: 'bg-amber-400',
    textColor: 'text-amber-300',
    label: 'Degraded',
    borderColor: 'border-amber-500/20',
  },
  unavailable: {
    dotBg: 'bg-rose-500',
    pingBg: 'bg-rose-400',
    textColor: 'text-rose-300',
    label: 'Offline',
    borderColor: 'border-rose-500/20',
  },
  checking: {
    dotBg: 'bg-ink-400',
    pingBg: 'bg-ink-300',
    textColor: 'text-ink-400',
    label: 'Checking',
    borderColor: 'border-ink-700',
  },
};

export function SystemHealthIndicator() {
  const [health, setHealth] = useState<SystemHealthStatus>({
    status: 'checking',
    details: 'Checking backend system status...',
    checkedAt: new Date(),
  });
  const [isProbing, setIsProbing] = useState(true);

  useEffect(() => {
    let isMounted = true;

    // Initial probe on mount without synchronous setState in effect
    checkBackendHealth(5000)
      .then((res) => {
        if (isMounted) {
          setHealth(res);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsProbing(false);
        }
      });

    // Poll health periodically in interval callback
    const interval = setInterval(() => {
      if (!isMounted) return;
      setIsProbing(true);
      checkBackendHealth(5000)
        .then((res) => {
          if (isMounted) {
            setHealth(res);
          }
        })
        .finally(() => {
          if (isMounted) {
            setIsProbing(false);
          }
        });
    }, 60000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleManualRefresh = useCallback(() => {
    setIsProbing(true);
    checkBackendHealth(5000)
      .then((res) => {
        setHealth(res);
      })
      .finally(() => {
        setIsProbing(false);
      });
  }, []);

  const config = STATUS_CONFIG[health.status];

  return (
    <div
      className="hidden h-8 items-center gap-2 rounded-md border border-ink-800 bg-ink-900 pl-2.5 pr-1 text-[12px] md:flex"
      title={`${health.details}${health.latencyMs !== undefined ? ` • Latency: ${health.latencyMs}ms` : ''} • Checked: ${health.checkedAt.toLocaleTimeString()}`}
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-2 w-2">
        {health.status === 'healthy' && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${config.pingBg}`}
          />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${config.dotBg}`} />
      </span>

      <span className="text-ink-400">API</span>
      <span className={`font-medium ${config.textColor}`}>
        {isProbing ? 'Checking…' : config.label}
      </span>

      {health.latencyMs !== undefined && health.status === 'healthy' && (
        <span className="hidden font-mono text-[11px] text-ink-500 xl:inline">
          {health.latencyMs}ms
        </span>
      )}

      <button
        type="button"
        onClick={handleManualRefresh}
        disabled={isProbing}
        aria-label="Re-check backend health"
        className="btn btn-ghost h-6 w-6 rounded px-0 text-ink-500"
      >
        <RefreshCw className={`h-3 w-3 ${isProbing ? 'animate-spin text-brand-300' : ''}`} />
      </button>
    </div>
  );
}
