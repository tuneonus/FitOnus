import { UploadImageError, type UploadRequest, type UploadResponse, type UploadTransport } from './upload-image';

/** Whole-upload cap. The native layer also times out a stalled connection (60 s on Android, the system default on iOS). */
export const UPLOAD_TIMEOUT_MS = 3 * 60_000;

export interface SendFileArgs {
  /** Absolute URL, query string included. */
  url: string;
  method: 'PUT' | 'POST';
  headers: Record<string, string>;
  /** The local file, sent as the raw body. */
  uri: string;
  onProgress?: ((fraction: number) => void) | undefined;
  signal: AbortSignal;
}

/** Sends one file and reports what the server answered, for any HTTP status. (The real one is native: `expo-file-sender.ts`.) */
export type SendFile = (args: SendFileArgs) => Promise<UploadResponse>;

export interface AuthorizedUploadDeps {
  /** The API base, e.g. `https://host/api/v1`. */
  baseUrl: () => string;
  getAccessToken: () => Promise<string | null>;
  /** Gets and stores a new access token, or throws when the session cannot continue. */
  refreshAccessToken: () => Promise<string>;
  /** Captures who is signed in now; `assertCurrent` throws when that changed (sign-out, another account). */
  captureSession: () => { assertCurrent: () => void };
  sendFile: SendFile;
  timeoutMs?: number;
}

const encode = (value: string): string => encodeURIComponent(value);

/** `base` + `path` + a query string, without relying on `URLSearchParams`. */
export function buildUploadUrl(base: string, path: string, query?: Record<string, string>): string {
  const root = base.replace(/\/+$/, '');
  const tail = path.startsWith('/') ? path : `/${path}`;
  const entries = Object.entries(query ?? {});
  const search = entries.map(([key, value]) => `${encode(key)}=${encode(value)}`).join('&');
  return `${root}${tail}${search ? `?${search}` : ''}`;
}

/**
 * Runs `work` with a signal that ends when the caller's signal does or when `ms` pass. A timeout is reported as
 * `UploadImageError('TIMEOUT')` (not as the caller cancelling), so the member is told what actually happened.
 */
async function withTimeout<T>(
  parent: AbortSignal | undefined,
  ms: number,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const onParentAbort = () => controller.abort();
  if (parent?.aborted) controller.abort();
  else parent?.addEventListener('abort', onParentAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ms);
  try {
    return await work(controller.signal);
  } catch (error) {
    if (timedOut && !parent?.aborted) {
      throw new UploadImageError('TIMEOUT', 'The upload took too long. Check your connection and try again.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', onParentAbort);
  }
}

/**
 * An `UploadTransport` for the signed-in member: it adds the bearer token and, like the app's API client, answers a `401`
 * by refreshing the token once and sending again. It also refuses to start if the member changed since the request was
 * made (so a photo chosen under one account is never uploaded under another).
 *
 * The native upload does not go through the app's axios client, so this is where the token logic is repeated; the single
 * refresh (`refreshAccessToken`) is the client's own, so a rotating refresh token is still never presented twice.
 */
export function createAuthorizedUploadTransport(deps: AuthorizedUploadDeps): UploadTransport {
  const timeoutMs = deps.timeoutMs ?? UPLOAD_TIMEOUT_MS;

  return async (request: UploadRequest): Promise<UploadResponse> => {
    const session = deps.captureSession();
    const url = buildUploadUrl(deps.baseUrl(), request.path, request.query);

    const attempt = (token: string | null): Promise<UploadResponse> => {
      session.assertCurrent();
      return withTimeout(request.signal, timeoutMs, (signal) =>
        deps.sendFile({
          url,
          method: request.method,
          headers: {
            'Content-Type': request.contentType,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          uri: request.uri,
          onProgress: request.onProgress,
          signal,
        }),
      );
    };

    const response = await attempt(await deps.getAccessToken());
    if (response.status !== 401) return response;
    // The access token expired: one refresh and one more try; a second 401 is the answer.
    return attempt(await deps.refreshAccessToken());
  };
}
