import type { Role } from '../../../shared/auth/permissions.js';
import { AppError, conflict, unprocessable } from '../../../shared/errors/app-error.js';

export const USER_STATUSES = ['active', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export interface User {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: Role;
  status: UserStatus;
  /** Incremented on every change; used for optimistic concurrency. */
  version: number;
  createdAt: Date;
  updatedAt: Date;
  disabledAt: Date | null;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTROL_CHARACTERS = /\p{Cc}/u;
export const DISPLAY_NAME_MAX_LENGTH = 100;

const invalid = (path: string, message: string) =>
  new AppError('validation', 'VALIDATION_FAILED', 'The request is invalid.', [
    { location: 'body', path, message },
  ]);

/** E-mail addresses are stored lower-cased and trimmed; the database enforces the same rule. */
export function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (email.length < 3 || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw invalid('email', 'Must be a valid email address');
  }
  return email;
}

export function normalizeDisplayName(raw: string): string {
  const name = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  const length = [...name].length;
  if (length === 0 || length > DISPLAY_NAME_MAX_LENGTH || CONTROL_CHARACTERS.test(name)) {
    throw invalid('displayName', `Must be 1-${DISPLAY_NAME_MAX_LENGTH} printable characters`);
  }
  return name;
}

/** Status changes are an administrative action on someone else's account. */
export function assertStatusTransition(actorUserId: string, user: User, target: UserStatus): void {
  if (actorUserId === user.id) {
    throw unprocessable('CANNOT_CHANGE_OWN_STATUS', 'You cannot change the status of your own account.');
  }
  if (user.status === target) {
    throw conflict('INVALID_STATE_TRANSITION', `The user is already ${target}.`);
  }
}
