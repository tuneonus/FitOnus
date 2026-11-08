'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { checkBackendHealth, type SystemHealthStatus } from '@/lib/system-health';

const STATUS_CONFIG = {
  healthy: {
    dotBg: 'bg-emerald-500',
    pingBg: 'bg-emerald-400',
    textColor: 'text-emerald-400',
    label: 'Online',
    borderColor: 'border-emerald-500/20',
  },
  degraded: {
    dotBg: 'bg-amber-500',
    pingBg: 'bg-amber-400',
    textColor: 'text-amber-400',
    label: 'Degraded',
    borderColor: 'border-amber-500/20',
  },
  unavailable: {
    dotBg: 'bg-rose-500',
    pingBg: 'bg-rose-400',
    textColor: 'text-rose-400',
    label: 'Offline',
    borderColor: 'border-rose-500/20',
  },
  checking: {
    dotBg: 'bg-slate-400',
    pingBg: 'bg-slate-300',
    textColor: 'text-slate-400',
    label: 'Checking',
    borderColor: 'border-slate-700',
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
      className={`hidden md:flex items-center gap-2 rounded-full border bg-slate-900/60 px-3 py-1 text-xs transition-colors ${config.borderColor}`}
      title={`${health.details}${health.latencyMs !== undefined ? ` • Latency: ${health.latencyMs}ms` : ''} • Checked: ${health.checkedAt.toLocaleTimeString()}`}
    >
      <span className="relative flex h-2 w-2">
        {health.status === 'healthy' && (
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${config.pingBg}`}
          />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${config.dotBg}`} />
      </span>

      <span className="text-slate-400">Backend API:</span>
      <span className={`font-semibold ${config.textColor}`}>
        {isProbing ? 'Checking...' : config.label}
      </span>

      {health.latencyMs !== undefined && health.status === 'healthy' && (
        <span className="text-[10px] text-slate-500 font-mono hidden xl:inline">
          {health.latencyMs}ms
        </span>
      )}

      <button
        type="button"
        onClick={handleManualRefresh}
        disabled={isProbing}
        aria-label="Refresh backend health"
        className="text-slate-500 hover:text-slate-300 transition-colors p-0.5 rounded"
      >
        <RefreshCw className={`h-3 w-3 ${isProbing ? 'animate-spin text-teal-400' : ''}`} />
      </button>
    </div>
  );
}
