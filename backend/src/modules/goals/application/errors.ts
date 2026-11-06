import { AppError } from '../../../shared/errors/app-error.js';

export function badRequest(message: string): AppError {
  return new AppError('bad_request', 'VALIDATION_FAILED', message);
}

export function notFound(message: string): AppError {
  return new AppError('not_found', 'NOT_FOUND', message);
}

export { AppError };
