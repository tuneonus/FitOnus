import type { ApiResponse } from '@/types';
import { getAuthToken } from './token-storage';

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1/admin';

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Enterprise API client for FitOnus Admin.
 * Uses Bearer token authentication (via Authorization header) and supports
 * credentials (cookies) as defense-in-depth across cross-origin deployments.
 * Custom headers ('X-Panel-Id') enforce CORS preflights against CSRF.
 */
export async function apiClient<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const headers = new Headers(options.headers || {});

  headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json');
  headers.set('X-Panel-Id', 'fitonus-admin');

  const token = getAuthToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Enforce 15-second default timeout to prevent hanging connections
  const timeoutSignal =
    typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
      ? AbortSignal.timeout(15000)
      : undefined;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    signal: options.signal ?? timeoutSignal,
    credentials: 'include', // Sends HttpOnly fitonus_admin_token cookie
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    const errorData = data?.error || {};
    const message =
      errorData.message ||
      data?.message ||
      `Request failed with status ${res.status}`;

    // Broadcast session expiration event for unauthenticated responses on protected endpoints
    if (
      res.status === 401 &&
      typeof window !== 'undefined' &&
      !window.location.pathname.startsWith('/login')
    ) {
      window.dispatchEvent(
        new CustomEvent('fitonus:auth:expired', { detail: { message } })
      );
    }

    throw new ApiError(message, res.status, errorData.code, errorData.details);
  }

  return data as ApiResponse<T>;
}

