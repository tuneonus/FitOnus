/**
 * Framework-free application error. Layers throw these; the HTTP error handler
 * is the only place that maps `kind` to a status code.
 */
export type ErrorKind =
  | 'bad_request'
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'method_not_allowed'
  | 'conflict'
  | 'payload_too_large'
  | 'unprocessable'
  | 'rate_limited'
  | 'unavailable'
  | 'internal';

/** Stable, machine-readable codes. Clients may branch on these; never rename one. */
export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_FAILED'
  | 'INVALID_JSON'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNAUTHENTICATED'
  | 'INVALID_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'SESSION_REVOKED'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_DISABLED'
  | 'REFRESH_TOKEN_INVALID'
  | 'REFRESH_TOKEN_REUSED'
  | 'REGISTRATION_DISABLED'
  | 'PASSWORD_POLICY_VIOLATION'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'ROUTE_NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'USER_NOT_FOUND'
  | 'SESSION_NOT_FOUND'
  | 'EMAIL_ALREADY_EXISTS'
  | 'VERSION_CONFLICT'
  | 'INVALID_STATE_TRANSITION'
  | 'CANNOT_CHANGE_OWN_STATUS'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'IDEMPOTENCY_REQUEST_IN_PROGRESS'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'FEATURE_DISABLED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  override readonly name = 'AppError';

  constructor(
    readonly kind: ErrorKind,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;

export const notFound = (code: ErrorCode, message: string): AppError =>
  new AppError('not_found', code, message);

export const forbidden = (message = 'You do not have permission to perform this action.'): AppError =>
  new AppError('forbidden', 'FORBIDDEN', message);

export const unauthorized = (code: ErrorCode, message: string): AppError =>
  new AppError('unauthorized', code, message);

export const conflict = (code: ErrorCode, message: string, details?: unknown): AppError =>
  new AppError('conflict', code, message, details);

export const unprocessable = (code: ErrorCode, message: string, details?: unknown): AppError =>
  new AppError('unprocessable', code, message, details);
