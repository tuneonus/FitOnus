import axios, { type InternalAxiosRequestConfig } from 'axios';
import { captureUserSession } from './user-session';

import { Config } from '../constants/config';
import { logger } from '../utils/logger';
import { SecureStorageService } from './secure-storage';
import { AuthRepository } from '../features/auth/api/auth-repository';
import { useAuthStore } from '../features/auth/stores/auth-store';

declare module 'axios' {
  interface AxiosRequestConfig {
    fitonusSession?: ReturnType<typeof captureUserSession>;
  }
}

export const apiClient = axios.create({
  baseURL: Config.API_BASE_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

const ACCESS_TOKEN_KEY = 'auth.access_token';
const REFRESH_TOKEN_KEY = 'auth.refresh_token';

const AUTH_ROUTE_PATTERN = /\/auth\/(login|register|refresh|forgot-password|reset-password)/;
const isAuthRouteUrl = (url?: string) => AUTH_ROUTE_PATTERN.test(url ?? '');

/** The refresh token was missing or definitively rejected by the server: the session cannot be recovered. */
class SessionExpiredError extends Error {
  constructor(cause?: unknown) {
    super('Your session has expired. Please sign in again.');
    this.name = 'SessionExpiredError';
    (this as { cause?: unknown }).cause = cause;
  }
}

/**
 * Only an explicit rejection of the refresh token ends the session. Offline, timeouts, 5xx and 429 are
 * transient: the stored tokens stay valid and the next request tries again.
 */
function isDefinitiveRefreshRejection(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 400 || status === 401 || status === 403;
}

async function endSession(refreshTokenUsed: string | null): Promise<void> {
  // A newer sign-in may have replaced the tokens while the refresh was in flight; never wipe those.
  const stored = await SecureStorageService.getItem(REFRESH_TOKEN_KEY);
  if (stored && stored !== refreshTokenUsed) return;
  await SecureStorageService.removeItem(ACCESS_TOKEN_KEY);
  await SecureStorageService.removeItem(REFRESH_TOKEN_KEY);
  useAuthStore.getState().clearAuth(); // AppShell redirects unauthenticated users to the welcome/login flow
}

async function performRefresh(): Promise<string> {
  const session = captureUserSession();
  const refreshToken = await SecureStorageService.getItem(REFRESH_TOKEN_KEY);
  session.assertCurrent();

  try {
    if (!refreshToken) throw new SessionExpiredError();
    // AuthRepository.refreshToken posts to /auth/refresh, which the interceptors treat as a public
    // auth route: no Authorization header is sent and a failure never triggers another refresh.
    const tokens = await AuthRepository.refreshToken(refreshToken);
    session.assertCurrent();
    // Persist the rotated refresh token first: the server revokes the session if the old one is replayed.
    await SecureStorageService.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
    await SecureStorageService.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    return tokens.accessToken;
  } catch (error) {
    if (error instanceof SessionExpiredError || isDefinitiveRefreshRejection(error)) {
      if (session.isCurrent()) await endSession(refreshToken);
      throw error instanceof SessionExpiredError ? error : new SessionExpiredError(error);
    }
    throw error;
  }
}

let refreshInFlight: Promise<string> | null = null;

/**
 * Single-flight token refresh: every caller that needs a new access token while one is being fetched
 * shares the same request, so a rotating refresh token is never presented twice.
 */
export function refreshAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    const attempt = performRefresh();
    refreshInFlight = attempt;
    const release = () => {
      if (refreshInFlight === attempt) refreshInFlight = null;
    };
    attempt.then(release, release);
  }
  return refreshInFlight;
}

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    config.fitonusSession ??= captureUserSession();
    config.fitonusSession.assertCurrent();
    config.baseURL = Config.API_BASE_URL;

    const isPublicAuthRoute = isAuthRouteUrl(config.url);

    if (!isPublicAuthRoute) {
      const accessToken = await SecureStorageService.getItem(ACCESS_TOKEN_KEY);
      if (accessToken && config.headers && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${accessToken}`;
      }
    } else if (config.headers?.Authorization) {
      delete config.headers.Authorization;
    }
    config.fitonusSession.assertCurrent();
    return config;
  },
  (error) => {
    logger.error('API Request Error:', error);
    return Promise.reject(error);
  },
);

apiClient.interceptors.response.use(
  (response) => {
    response.config.fitonusSession?.assertCurrent();
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    originalRequest?.fitonusSession?.assertCurrent();
    const errorData = error?.response?.data;
    const errorMessage = errorData?.error?.message || errorData?.message || error.message;

    // One refresh + one retry per request: `_retry` guards against loops, auth routes never refresh.
    const canRefresh =
      Boolean(originalRequest) &&
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isAuthRouteUrl(originalRequest.url);

    // Messages and URLs only; never log headers, request bodies or tokens.
    const details = { status: error.response?.status, url: originalRequest?.url, message: errorMessage };
    if (canRefresh) logger.info('Access token rejected, refreshing session', details);
    else logger.error('API Response Error:', details);

    if (!canRefresh) return Promise.reject(error);

    originalRequest._retry = true;
    const sentAuthorization = originalRequest.headers?.Authorization;

    // A request that was already in flight when another request refreshed carries the old token. If the
    // stored token has moved on, retry with it instead of spending another (rotating) refresh token.
    const storedAccessToken = await SecureStorageService.getItem(ACCESS_TOKEN_KEY);
    originalRequest.fitonusSession?.assertCurrent();
    const alreadyRefreshed =
      !refreshInFlight && storedAccessToken && sentAuthorization !== `Bearer ${storedAccessToken}`;

    const accessToken = alreadyRefreshed ? storedAccessToken : await refreshAccessToken();
    originalRequest.fitonusSession?.assertCurrent();

    originalRequest.headers.Authorization = `Bearer ${accessToken}`;
    return apiClient(originalRequest);
  },
);
