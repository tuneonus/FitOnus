import { importPKCS8, SignJWT } from 'jose';
import type { PushMessage, PushSender, PushSendResult } from '../application/ports.js';

export interface FcmCredentials {
  projectId: string;
  clientEmail: string;
  /** PEM private key from the service-account file. Never logged, never returned from any endpoint. */
  privateKey: string;
  tokenUri: string;
}

export interface FcmSenderOptions {
  credentials: FcmCredentials;
  dryRun: boolean;
  timeoutMs: number;
  /** Injected in tests; defaults to the global fetch. */
  fetch?: typeof fetch;
  now?: () => number;
}

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const FCM_ORIGIN = 'https://fcm.googleapis.com';
/** Renew the OAuth token this long before it expires so an in-flight send never carries a stale one. */
const TOKEN_REFRESH_MARGIN_MS = 120_000;
const MESSAGE_TTL = '86400s';

/** Only Google token endpoints are accepted, so a tampered service-account file cannot redirect the signed assertion. */
export function safeTokenUri(candidate: string | undefined): string {
  if (!candidate) return DEFAULT_TOKEN_URI;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' && url.hostname.endsWith('.googleapis.com')
      ? url.toString()
      : DEFAULT_TOKEN_URI;
  } catch {
    return DEFAULT_TOKEN_URI;
  }
}

interface FcmErrorBody {
  error?: {
    code?: number;
    status?: string;
    message?: string;
    details?: { errorCode?: string; '@type'?: string }[];
  };
}

function parseRetryAfterMs(header: string | null, now: number): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

/**
 * Maps an FCM HTTP v1 error response to what the dispatcher should do next.
 * Reference: https://firebase.google.com/docs/reference/fcm/rest/v1/ErrorCode
 * Only the provider's error code is surfaced; the response text (which can echo the token) never leaves here.
 */
export function classifyFcmError(
  status: number,
  body: FcmErrorBody | null,
  retryAfterMs?: number,
): Exclude<PushSendResult, { kind: 'accepted' }> {
  const fcmCode = body?.error?.details?.find((detail) => detail.errorCode)?.errorCode;
  const statusText = body?.error?.status;
  const code = fcmCode ?? statusText ?? `HTTP_${status}`;
  const retry = (retryable: string): PushSendResult & { kind: 'retryable' } =>
    retryAfterMs === undefined
      ? { kind: 'retryable', code: retryable }
      : { kind: 'retryable', code: retryable, retryAfterMs };

  if (fcmCode === 'UNREGISTERED' || status === 404) return { kind: 'invalid_token', code: 'UNREGISTERED' };
  // A malformed token is reported as INVALID_ARGUMENT, exactly like a malformed payload; only the former is token-specific.
  if (
    fcmCode === 'INVALID_ARGUMENT' &&
    /registration token|not a valid fcm/i.test(body?.error?.message ?? '')
  ) {
    return { kind: 'invalid_token', code: 'INVALID_TOKEN' };
  }
  if (fcmCode === 'SENDER_ID_MISMATCH') return { kind: 'invalid_token', code: 'SENDER_ID_MISMATCH' };

  if (status === 429 || fcmCode === 'QUOTA_EXCEEDED') return retry('QUOTA_EXCEEDED');
  if (status === 503 || fcmCode === 'UNAVAILABLE') return retry('UNAVAILABLE');
  if (status >= 500 || fcmCode === 'INTERNAL') return retry('INTERNAL');
  // Auth problems are our configuration, not the user's device: keep the message and let it be retried.
  if (status === 401 || fcmCode === 'THIRD_PARTY_AUTH_ERROR') return retry('FCM_AUTH_FAILED');
  if (status === 403 && fcmCode !== 'SENDER_ID_MISMATCH') return retry('FCM_PERMISSION_DENIED');

  return { kind: 'failed', code };
}

export class FcmHttpV1Sender implements PushSender {
  readonly dryRun: boolean;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private accessToken: { value: string; expiresAt: number } | null = null;
  private pendingToken: Promise<string> | null = null;
  private signingKey: ReturnType<typeof importPKCS8> | null = null;

  private readonly options: FcmSenderOptions;

  constructor(options: FcmSenderOptions) {
    // Defence in depth: whatever the caller passes, the signed assertion only ever goes to a Google endpoint.
    this.options = {
      ...options,
      credentials: { ...options.credentials, tokenUri: safeTokenUri(options.credentials.tokenUri) },
    };
    this.dryRun = options.dryRun;
    this.fetchFn = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async send(message: PushMessage): Promise<PushSendResult> {
    try {
      const first = await this.post(message);
      // An access token can be revoked early; renew once before treating 401 as a real failure.
      if (first.kind === 'retryable' && first.code === 'FCM_AUTH_FAILED' && this.accessToken) {
        this.accessToken = null;
        return await this.post(message);
      }
      return first;
    } catch (error) {
      if (error instanceof FcmAuthError) return { kind: 'retryable', code: 'FCM_AUTH_FAILED' };
      return { kind: 'retryable', code: isTimeout(error) ? 'TIMEOUT' : 'NETWORK_ERROR' };
    }
  }

  private async post(message: PushMessage): Promise<PushSendResult> {
    const token = await this.getAccessToken();
    const response = await this.fetchFn(
      `${FCM_ORIGIN}/v1/projects/${encodeURIComponent(this.options.credentials.projectId)}/messages:send`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({
          validate_only: this.options.dryRun,
          message: {
            token: message.token,
            notification: { title: message.title, body: message.body },
            data: message.data,
            android: {
              priority: 'HIGH',
              ttl: MESSAGE_TTL,
              notification: { channel_id: message.channelId },
            },
          },
        }),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      },
    );

    if (response.ok) {
      const body = (await response.json().catch(() => null)) as { name?: string } | null;
      return { kind: 'accepted', messageId: body?.name ?? null };
    }
    const body = (await response.json().catch(() => null)) as FcmErrorBody | null;
    return classifyFcmError(
      response.status,
      body,
      parseRetryAfterMs(response.headers.get('retry-after'), this.now()),
    );
  }

  /** One in-flight token request at a time; every concurrent send shares it. */
  private getAccessToken(): Promise<string> {
    const cached = this.accessToken;
    if (cached && cached.expiresAt - TOKEN_REFRESH_MARGIN_MS > this.now())
      return Promise.resolve(cached.value);
    this.pendingToken ??= this.fetchAccessToken().finally(() => {
      this.pendingToken = null;
    });
    return this.pendingToken;
  }

  private async fetchAccessToken(): Promise<string> {
    const { credentials } = this.options;
    this.signingKey ??= importPKCS8(credentials.privateKey, 'RS256');
    const assertion = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(credentials.clientEmail)
      .setSubject(credentials.clientEmail)
      .setAudience(credentials.tokenUri)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(await this.signingKey);

    const response = await this.fetchFn(credentials.tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
      signal: AbortSignal.timeout(this.options.timeoutMs),
    });
    if (!response.ok) throw new FcmAuthError(response.status);
    const body = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new FcmAuthError(response.status);
    this.accessToken = {
      value: body.access_token,
      expiresAt: this.now() + (body.expires_in ?? 3600) * 1000,
    };
    return body.access_token;
  }
}

/** Carries only the HTTP status: provider text could contain credential fragments. */
export class FcmAuthError extends Error {
  override readonly name = 'FcmAuthError';
  constructor(readonly status: number) {
    super(`FCM OAuth token request failed with HTTP ${status}`);
  }
}

const isTimeout = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
