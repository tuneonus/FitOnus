import type { Role } from '../../../shared/auth/permissions.js';
import { normalizeDisplayName, normalizeEmail, type User, type UserStatus } from '../domain/user.js';
import type { UserRepository } from './ports.js';

export interface AccountState {
  id: string;
  role: Role;
  status: UserStatus;
}

export interface AccountCredentials extends AccountState {
  email: string;
  passwordHash: string;
}

/**
 * In-process API other modules (auth, seed scripts) use to work with accounts.
 * Exposes credentials, so it is never mapped to HTTP routes directly.
 */
export interface UserAccountsApi {
  findCredentialsByEmail(email: string): Promise<AccountCredentials | null>;
  findCredentialsById(id: string): Promise<AccountCredentials | null>;
  getAccountState(id: string): Promise<AccountState | null>;
  registerAccount(input: {
    email: string;
    displayName: string;
    passwordHash: string;
    role?: Role;
  }): Promise<AccountState>;
  updatePasswordHash(id: string, passwordHash: string): Promise<void>;
}

const toCredentials = (user: User): AccountCredentials => ({
  id: user.id,
  email: user.email,
  role: user.role,
  status: user.status,
  passwordHash: user.passwordHash,
});

export function createUserAccountsApi(users: UserRepository): UserAccountsApi {
  return {
    async findCredentialsByEmail(email) {
      let normalized: string;
      try {
        normalized = normalizeEmail(email);
      } catch {
        return null;
      }
      const user = await users.findByEmail(normalized);
      return user ? toCredentials(user) : null;
    },

    async findCredentialsById(id) {
      const user = await users.findById(id);
      return user ? toCredentials(user) : null;
    },

    async getAccountState(id) {
      const user = await users.findById(id);
      return user ? { id: user.id, role: user.role, status: user.status } : null;
    },

    async registerAccount(input) {
      const user = await users.insert({
        email: normalizeEmail(input.email),
        displayName: normalizeDisplayName(input.displayName),
        passwordHash: input.passwordHash,
        role: input.role ?? 'member',
      });
      return { id: user.id, role: user.role, status: user.status };
    },

    async updatePasswordHash(id, passwordHash) {
      await users.updatePasswordHash(id, passwordHash);
    },
  };
}
