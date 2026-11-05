import type { Role } from '../../../shared/auth/permissions.js';
import type { User, UserStatus } from '../domain/user.js';

/** Public representation of a user. Never contains the password hash. JSON-safe (ISO dates). */
export interface UserView {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  status: UserStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  disabledAt: string | null;
}

export const toUserView = (user: User): UserView => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  role: user.role,
  status: user.status,
  version: user.version,
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString(),
  disabledAt: user.disabledAt?.toISOString() ?? null,
});
