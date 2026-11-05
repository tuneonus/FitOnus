import { AppError } from '../errors/app-error.js';

/** NIST SP 800-63B style: length-based, no composition rules, long passphrases allowed. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export function assertPasswordPolicy(password: string): void {
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH || password.trim().length === 0) {
    throw new AppError(
      'validation',
      'PASSWORD_POLICY_VIOLATION',
      `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`,
    );
  }
}
