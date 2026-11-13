import type { PasswordResetMessage, PasswordResetNotifier } from '../application/ports.js';
import { buildPasswordResetEmail } from './password-reset-email.js';

const RESEND_EMAILS_URL = 'https://api.resend.com/emails';
const MINUTE_MS = 60_000;

/*
 * Delivery failures. Resend's response bodies can echo recipient addresses and SDK/transport errors can
 * carry request details, so none of that is copied: each failure is a fixed message plus (at most) the
 * HTTP status, and the class name tells operators the category. The use case reports only `error.name`
 * (see PasswordResetFailureEvent), which is why the category lives in the name.
 */
export class ResendDeliveryError extends Error {
  override readonly name: string = 'ResendDeliveryError';
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}
export class ResendTimeoutError extends ResendDeliveryError {
  override readonly name = 'ResendTimeoutError';
  constructor(timeoutMs: number) {
    super(`Resend did not answer within ${timeoutMs} ms`);
  }
}
export class ResendNetworkError extends ResendDeliveryError {
  override readonly name = 'ResendNetworkError';
  constructor() {
    super('Could not reach Resend');
  }
}
/** 401/403: wrong, revoked or restricted API key, or an unverified sender domain. Needs operator action. */
export class ResendAuthError extends ResendDeliveryError {
  override readonly name = 'ResendAuthError';
  constructor(status: number) {
    super(`Resend refused the credentials or sender (HTTP ${status})`, status);
  }
}
/** 429: Resend's own rate or quota limit. */
export class ResendRateLimitedError extends ResendDeliveryError {
  override readonly name = 'ResendRateLimitedError';
  constructor() {
    super('Resend rate limit or quota reached (HTTP 429)', 429);
  }
}
/** Any other 4xx: Resend rejected the request itself (e.g. invalid recipient). Retrying will not help. */
export class ResendRejectedError extends ResendDeliveryError {
  override readonly name = 'ResendRejectedError';
  constructor(status: number) {
    super(`Resend rejected the message (HTTP ${status})`, status);
  }
}
/** 5xx and anything unexpected. Usually transient. */
export class ResendServerError extends ResendDeliveryError {
  override readonly name = 'ResendServerError';
  constructor(status: number) {
    super(`Resend answered with an unexpected status (HTTP ${status})`, status);
  }
}

function errorForStatus(status: number): ResendDeliveryError {
  if (status === 401 || status === 403) return new ResendAuthError(status);
  if (status === 429) return new ResendRateLimitedError();
  if (status >= 400 && status < 500) return new ResendRejectedError(status);
  return new ResendServerError(status);
}

const isAbort = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'name' in error &&
  (error.name === 'TimeoutError' || error.name === 'AbortError');

export interface ResendPasswordResetNotifierOptions {
  /** Resend API key. Held in a private field: never part of logs, JSON or `util.inspect` output. */
  apiKey: string;
  /** Verified sender, e.g. `OnusFit <noreply@tuneonus.com>`. */
  from: string;
  /** Hard bound for the whole request (connect, send and waiting for the response head). */
  timeoutMs: number;
  /** Test seam. Defaults to the runtime's native `fetch`, looked up at call time. */
  fetch?: typeof fetch;
  /** Test seam for the "valid for N minutes" wording. */
  now?: () => Date;
}

/**
 * Sends the password reset code through Resend's HTTP API with native `fetch`.
 *
 * Contract with the reset use case: `send` resolves once Resend accepted the message and rejects with a
 * `ResendDeliveryError` subclass otherwise. It never logs, and the OTP only ever leaves this
 * process inside the request body to Resend (never in the URL, headers, error messages or logs).
 */
export class ResendPasswordResetNotifier implements PasswordResetNotifier {
  readonly #apiKey: string;
  readonly #from: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;
  readonly #now: () => Date;

  constructor(options: ResendPasswordResetNotifierOptions) {
    if (!options.apiKey.trim()) throw new Error('ResendPasswordResetNotifier: apiKey is required');
    if (!options.from.trim()) throw new Error('ResendPasswordResetNotifier: from is required');
    if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1) {
      throw new Error('ResendPasswordResetNotifier: timeoutMs must be a positive integer');
    }
    this.#apiKey = options.apiKey.trim();
    this.#from = options.from.trim();
    this.#timeoutMs = options.timeoutMs;
    this.#fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.#now = options.now ?? (() => new Date());
  }

  async send(message: PasswordResetMessage): Promise<void> {
    const validForMinutes = Math.max(
      1,
      Math.round((message.expiresAt.getTime() - this.#now().getTime()) / MINUTE_MS),
    );
    const { subject, text, html } = buildPasswordResetEmail({ otp: message.otp, validForMinutes });

    let response: Response;
    try {
      response = await this.#fetch(RESEND_EMAILS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.#apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'backend-mailer/1',
        },
        body: JSON.stringify({ from: this.#from, to: [message.email], subject, text, html }),
        signal: AbortSignal.timeout(this.#timeoutMs),
        // Never follow a redirect: it could carry the Authorization header somewhere else.
        redirect: 'error',
      });
    } catch (error) {
      // The original error is intentionally dropped (no `cause`): transport errors can echo request details.
      throw isAbort(error) ? new ResendTimeoutError(this.#timeoutMs) : new ResendNetworkError();
    }

    // The response body is never read (it can echo the recipient); free the connection instead.
    void response.body?.cancel().catch(() => undefined);
    if (!response.ok) throw errorForStatus(response.status);
  }
}
