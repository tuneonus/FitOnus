import type { Role } from '../../../shared/auth/permissions.js';
import type { Page, PageRequest } from '../../../shared/pagination/pagination.js';
import type { User, UserStatus } from '../domain/user.js';

export type UserSortField = 'createdAt' | 'email' | 'displayName';

export interface UserListQuery extends PageRequest {
  search?: string | undefined;
  status?: UserStatus | undefined;
  role?: Role | undefined;
  sort: UserSortField;
  order: 'asc' | 'desc';
}

export interface NewUser {
  email: string;
  displayName: string;
  passwordHash: string;
  role: Role;
}

/** Persistence port. Implementations must translate duplicate e-mail into EMAIL_ALREADY_EXISTS. */
export interface UserRepository {
  insert(user: NewUser): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  list(query: UserListQuery): Promise<Page<User>>;
  /** Compare-and-set on `version`; null when the row is missing or was changed concurrently. */
  updateProfile(id: string, expectedVersion: number, changes: { displayName: string }): Promise<User | null>;
  /** Compare-and-set on `version`; null when the row is missing, changed, or already in `status`. */
  changeStatus(id: string, expectedVersion: number, status: UserStatus): Promise<User | null>;
  updatePasswordHash(id: string, passwordHash: string): Promise<boolean>;
  deleteById(id: string): Promise<boolean>;
}
