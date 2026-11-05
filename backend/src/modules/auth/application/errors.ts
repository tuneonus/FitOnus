import { AppError, unauthorized } from '../../../shared/errors/app-error.js';

// One generic message for unknown e-mail and wrong password, so responses don't reveal which accounts exist.
export const invalidCredentials = () => unauthorized('INVALID_CREDENTIALS', 'Invalid email or password.');

export const accountDisabled = () =>
  new AppError('forbidden', 'ACCOUNT_DISABLED', 'This account is disabled.');

export const sessionRevoked = () =>
  unauthorized('SESSION_REVOKED', 'The session is no longer valid. Please sign in again.');

export const invalidRefreshToken = () =>
  unauthorized('REFRESH_TOKEN_INVALID', 'The refresh token is invalid or expired. Please sign in again.');

export const refreshTokenReused = () =>
  unauthorized('REFRESH_TOKEN_REUSED', 'The refresh token was already used. The session has been revoked.');
