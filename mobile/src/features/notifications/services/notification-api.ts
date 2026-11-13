import type {
  PushBackendConfig,
  PushDeviceRegistrationRequest,
  PushDeviceRegistrationResponse,
  RegistrationFailureKind,
} from '../types/push-contract';

/** Minimal HTTP surface the adapter needs (the app's axios `apiClient` is wrapped to fit). */
export interface PushHttpClient {
  put: (url: string, body: unknown) => Promise<{ status: number; data?: unknown }>;
  delete: (url: string) => Promise<{ status: number; data?: unknown }>;
}

export type RegisterOutcome =
  | { status: 'inactive' }
  | { status: 'registered'; response: PushDeviceRegistrationResponse }
  | { status: 'failed'; kind: RegistrationFailureKind; retryable: boolean; httpStatus?: number | undefined };

export type UnregisterOutcome =
  | { status: 'inactive' }
  | { status: 'unregistered' }
  | { status: 'failed'; kind: RegistrationFailureKind; retryable: boolean; httpStatus?: number | undefined };

export interface PushRegistrationApi {
  /** False until a `PushBackendConfig` is supplied. While false, no request is ever sent. */
  readonly isActive: boolean;
  register: (request: PushDeviceRegistrationRequest) => Promise<RegisterOutcome>;
  unregister: (installationId: string) => Promise<UnregisterOutcome>;
}

export interface ClassifiedRegistrationError {
  kind: RegistrationFailureKind;
  retryable: boolean;
  httpStatus?: number | undefined;
}

/** Map an unknown thrown value (axios-shaped) to a retry decision. */
export function classifyRegistrationError(error: unknown): ClassifiedRegistrationError {
  const err = (error ?? {}) as {
    name?: string;
    message?: string;
    code?: string;
    response?: { status?: number };
  };

  if (err.name === 'SessionChangedError') return { kind: 'auth', retryable: false };

  const status = err.response?.status;
  if (typeof status === 'number') {
    if (status === 401 || status === 403) return { kind: 'auth', retryable: false, httpStatus: status };
    if (status === 404 || status === 405) return { kind: 'endpoint-missing', retryable: false, httpStatus: status };
    if (status === 429 || status === 408) return { kind: 'rate-limited', retryable: true, httpStatus: status };
    if (status >= 500) return { kind: 'server', retryable: true, httpStatus: status };
    if (status >= 400) return { kind: 'rejected', retryable: false, httpStatus: status };
  }

  const message = (err.message ?? '').toLowerCase();
  if (
    err.code === 'ECONNABORTED' ||
    err.code === 'ERR_NETWORK' ||
    message.includes('network') ||
    message.includes('timeout')
  ) {
    return { kind: 'network', retryable: true };
  }
  return { kind: 'unknown', retryable: false };
}

export function createPushRegistrationApi(options: {
  http: PushHttpClient;
  /** Omit (or pass null) to keep the adapter inactive. */
  config?: PushBackendConfig | null | undefined;
}): PushRegistrationApi {
  const { http, config } = options;

  if (!config) {
    return {
      isActive: false,
      register: () => Promise.resolve({ status: 'inactive' }),
      unregister: () => Promise.resolve({ status: 'inactive' }),
    };
  }

  return {
    isActive: true,
    async register(request) {
      try {
        const res = await http.put(config.upsertDevicePath(request.installationId), request);
        return {
          status: 'registered',
          response: (res.data && typeof res.data === 'object' ? res.data : {}) as PushDeviceRegistrationResponse,
        };
      } catch (error) {
        return { status: 'failed', ...classifyRegistrationError(error) };
      }
    },
    async unregister(installationId) {
      try {
        await http.delete(config.deleteDevicePath(installationId));
        return { status: 'unregistered' };
      } catch (error) {
        const classified = classifyRegistrationError(error);
        // The row is already gone: that is the desired end state.
        if (classified.kind === 'endpoint-missing' && classified.httpStatus === 404) {
          return { status: 'unregistered' };
        }
        return { status: 'failed', ...classified };
      }
    },
  };
}

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  sleep: (ms: number) => Promise<void>;
  /** Return true to stop retrying (e.g. the user logged out meanwhile). */
  shouldAbort?: () => boolean;
}

export type RegisterWithRetryOutcome =
  | { status: 'inactive' }
  | { status: 'registered'; attempts: number }
  | { status: 'failed'; kind: RegistrationFailureKind; retryable: boolean; attempts: number };

/** Exponential backoff for transient failures only; permanent failures return immediately. */
export async function registerDeviceWithRetry(
  api: PushRegistrationApi,
  request: PushDeviceRegistrationRequest,
  retry: RetryOptions,
): Promise<RegisterWithRetryOutcome> {
  let attempts = 0;
  for (;;) {
    attempts += 1;
    const outcome = await api.register(request);

    if (outcome.status === 'inactive') return { status: 'inactive' };
    if (outcome.status === 'registered') return { status: 'registered', attempts };

    const exhausted = attempts >= retry.maxAttempts;
    if (!outcome.retryable || exhausted || retry.shouldAbort?.()) {
      return { status: 'failed', kind: outcome.kind, retryable: outcome.retryable, attempts };
    }
    await retry.sleep(retry.baseDelayMs * 2 ** (attempts - 1));
    if (retry.shouldAbort?.()) {
      return { status: 'failed', kind: outcome.kind, retryable: outcome.retryable, attempts };
    }
  }
}
