import type { ApiResponse } from '@/types';

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
 * Relies on secure HttpOnly session cookies with SameSite=Lax.
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

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
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
    throw new ApiError(message, res.status, errorData.code, errorData.details);
  }

  return data as ApiResponse<T>;
}

