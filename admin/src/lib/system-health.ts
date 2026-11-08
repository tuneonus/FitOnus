import { API_BASE } from './api-client';

export type HealthState = 'healthy' | 'degraded' | 'unavailable' | 'checking';

export interface SystemHealthStatus {
  status: HealthState;
  latencyMs?: number;
  details: string;
  checkedAt: Date;
}

/**
 * Derives the backend health endpoint URL safely from API_BASE without hardcoded URLs.
 * Resolves to the /health/ready readiness probe which verifies PostgreSQL connectivity.
 */
export function getHealthEndpointUrl(apiBase: string = API_BASE): string {
  try {
    const parsed = new URL(apiBase);
    return `${parsed.origin}/health/ready`;
  } catch {
    const sanitized = apiBase.replace(/\/api\/v1(?:\/admin)?\/?$/, '');
    return `${sanitized}/health/ready`;
  }
}

/**
 * Derives the liveness probe endpoint URL as a fallback.
 */
export function getLivenessEndpointUrl(apiBase: string = API_BASE): string {
  try {
    const parsed = new URL(apiBase);
    return `${parsed.origin}/health/live`;
  } catch {
    const sanitized = apiBase.replace(/\/api\/v1(?:\/admin)?\/?$/, '');
    return `${sanitized}/health/live`;
  }
}

/**
 * Probes backend health safely with timeout, returning a normalized status.
 * Never throws unhandled exceptions or crashes callers.
 */
export async function checkBackendHealth(
  timeoutMs: number = 5000,
  apiBase: string = API_BASE,
): Promise<SystemHealthStatus> {
  const start = Date.now();
  const readyUrl = getHealthEndpointUrl(apiBase);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(readyUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    const latencyMs = Date.now() - start;

    if (res.ok) {
      return {
        status: 'healthy',
        latencyMs,
        details: 'Backend API & Neon DB are online',
        checkedAt: new Date(),
      };
    }

    if (res.status === 503) {
      return {
        status: 'degraded',
        latencyMs,
        details: 'Database unreachable (503 Service Unavailable)',
        checkedAt: new Date(),
      };
    }

    // If 404, attempt fallback to liveness probe /health/live
    if (res.status === 404) {
      const liveUrl = getLivenessEndpointUrl(apiBase);
      try {
        const liveRes = await fetch(liveUrl, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (liveRes.ok) {
          return {
            status: 'healthy',
            latencyMs: Date.now() - start,
            details: 'Backend API process is active',
            checkedAt: new Date(),
          };
        }
      } catch {
        // Ignore fallback error and report unavailable below
      }
    }

    return {
      status: 'unavailable',
      latencyMs,
      details: `Health check returned HTTP ${res.status}`,
      checkedAt: new Date(),
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const isTimeout = err instanceof Error && err.name === 'AbortError';

    return {
      status: 'unavailable',
      latencyMs,
      details: isTimeout ? 'Health check timed out' : 'Backend service unreachable',
      checkedAt: new Date(),
    };
  } finally {
    clearTimeout(timer);
  }
}
