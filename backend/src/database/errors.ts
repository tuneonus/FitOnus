import { AppError } from '../shared/errors/app-error.js';

/** PostgreSQL SQLSTATE codes this codebase reacts to. */
export const PG_ERROR = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  CHECK_VIOLATION: '23514',
  NOT_NULL_VIOLATION: '23502',
  SERIALIZATION_FAILURE: '40001',
  DEADLOCK_DETECTED: '40P01',
  QUERY_CANCELED: '57014',
  ADMIN_SHUTDOWN: '57P01',
  TOO_MANY_CONNECTIONS: '53300',
} as const;

export interface PgError extends Error {
  code: string;
  constraint?: string;
}

export const isPgError = (error: unknown): error is PgError => {
  if (!(error instanceof Error)) return false;
  const code: unknown = (error as { code?: unknown }).code;
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code);
};

export const isUniqueViolation = (error: unknown, constraint?: string): boolean =>
  isPgError(error) &&
  error.code === PG_ERROR.UNIQUE_VIOLATION &&
  (constraint === undefined || error.constraint === constraint);

const unavailable = (cause: unknown) =>
  new AppError('unavailable', 'SERVICE_UNAVAILABLE', 'The service is temporarily unavailable.', undefined, {
    cause,
  });

/**
 * Fallback mapping for database errors a repository did not translate itself.
 * Never exposes SQL, constraint names or table names to the client.
 */
export function mapDatabaseError(error: unknown): AppError | null {
  if (!isPgError(error)) {
    if (
      error instanceof Error &&
      /timeout exceeded when trying to connect|Connection terminated/i.test(error.message)
    ) {
      return unavailable(error);
    }
    return null;
  }
  switch (error.code) {
    case PG_ERROR.SERIALIZATION_FAILURE:
    case PG_ERROR.DEADLOCK_DETECTED:
      return new AppError(
        'conflict',
        'CONFLICT',
        'The request conflicted with a concurrent update. Retry it.',
      );
    case PG_ERROR.QUERY_CANCELED:
    case PG_ERROR.ADMIN_SHUTDOWN:
    case PG_ERROR.TOO_MANY_CONNECTIONS:
      return unavailable(error);
    default:
      if (error.code.startsWith('08')) return unavailable(error);
      if (error.code.startsWith('23')) {
        return new AppError('conflict', 'CONFLICT', 'The request violates a data integrity rule.');
      }
      return null;
  }
}
