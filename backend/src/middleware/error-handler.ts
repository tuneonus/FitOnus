import type { ErrorRequestHandler, RequestHandler } from 'express';
import { mapDatabaseError } from '../database/errors.js';
import { AppError, isAppError, type ErrorKind } from '../shared/errors/app-error.js';

export const STATUS_BY_KIND: Readonly<Record<ErrorKind, number>> = {
  bad_request: 400,
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  conflict: 409,
  payload_too_large: 413,
  unprocessable: 422,
  rate_limited: 429,
  internal: 500,
  unavailable: 503,
};

interface BodyParserError {
  type: string;
  status?: number;
}

const isBodyParserError = (error: unknown): error is BodyParserError =>
  typeof error === 'object' && error !== null && typeof (error as { type?: unknown }).type === 'string';

function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  if (isBodyParserError(error)) {
    if (error.type === 'entity.too.large') {
      return new AppError('payload_too_large', 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
    }
    if (error.type === 'entity.parse.failed') {
      return new AppError('bad_request', 'INVALID_JSON', 'The request body is not valid JSON.');
    }
    if (error.status !== undefined && error.status >= 400 && error.status < 500) {
      return new AppError('bad_request', 'BAD_REQUEST', 'The request could not be processed.');
    }
  }
  return (
    mapDatabaseError(error) ?? new AppError('internal', 'INTERNAL_ERROR', 'An unexpected error occurred.')
  );
}

/** Last middleware. Produces the error envelope; internals are logged, never returned. */
export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const appError = toAppError(error);
  const status = STATUS_BY_KIND[appError.kind];
  // pino-http logs this with the request's completion line (stack included, once).
  if (status >= 500) res.err = error instanceof Error ? error : new Error(String(error));

  res.status(status).json({
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      requestId: typeof req.id === 'string' || typeof req.id === 'number' ? String(req.id) : 'unknown',
      ...(status < 500 && appError.details !== undefined ? { details: appError.details } : {}),
    },
  });
};

export const notFoundHandler: RequestHandler = () => {
  throw new AppError('not_found', 'ROUTE_NOT_FOUND', 'The requested route does not exist.');
};
