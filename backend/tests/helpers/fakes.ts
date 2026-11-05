import { randomUUID } from 'node:crypto';
import type {
  AccessTokenClaims,
  AccessTokenService,
  NewSession,
  SessionRepository,
  UserAccountsPort,
} from '../../src/modules/auth/application/ports.js';
import type { RevokeReason, Session } from '../../src/modules/auth/domain/session.js';
import type { NewUser, UserListQuery, UserRepository } from '../../src/modules/users/application/ports.js';
import type { User, UserStatus } from '../../src/modules/users/domain/user.js';
import type { UnitOfWork } from '../../src/shared/application/unit-of-work.js';
import { createActor, type Actor } from '../../src/shared/auth/actor.js';
import type { Role } from '../../src/shared/auth/permissions.js';
import { conflict, unauthorized } from '../../src/shared/errors/app-error.js';
import type {
  IdempotencyKeyRef,
  IdempotencyRecord,
  IdempotencyStore,
} from '../../src/shared/idempotency/idempotency.js';
import type { Page } from '../../src/shared/pagination/pagination.js';
import type { KeyedHasher } from '../../src/shared/security/keyed-hasher.js';
import type { PasswordHasher } from '../../src/shared/security/password-hasher.js';

export const actorFor = (role: Role, userId: string = randomUUID()): Actor =>
  createActor({ userId, sessionId: randomUUID(), role });

/** Runs work directly; enough to test orchestration, not atomicity (integration tests cover that). */
export class FakeUnitOfWork implements UnitOfWork {
  runs = 0;
  run<T>(work: () => Promise<T>): Promise<T> {
    this.runs += 1;
    return work();
  }
}

export class FakePasswordHasher implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return Promise.resolve(`hashed:${plain}`);
  }
  verify(hash: string, plain: string): Promise<boolean> {
    return Promise.resolve(hash === `hashed:${plain}`);
  }
  needsRehash(): boolean {
    return false;
  }
}

export class FakeKeyedHasher implements KeyedHasher {
  digest(value: string): string {
    return `digest(${value})`;
  }
  matches(value: string, digest: string): boolean {
    return this.digest(value) === digest;
  }
}

export class InMemoryUserRepository implements UserRepository {
  readonly users = new Map<string, User>();

  add(partial: Partial<User> & { email: string }): User {
    const now = new Date();
    const user: User = {
      id: randomUUID(),
      displayName: 'Someone',
      passwordHash: 'hashed:password-123456',
      role: 'member',
      status: 'active',
      version: 1,
      createdAt: now,
      updatedAt: now,
      disabledAt: null,
      ...partial,
    };
    this.users.set(user.id, user);
    return user;
  }

  insert(input: NewUser): Promise<User> {
    if ([...this.users.values()].some((user) => user.email === input.email)) {
      return Promise.reject(conflict('EMAIL_ALREADY_EXISTS', 'A user with this email already exists.'));
    }
    return Promise.resolve(this.add(input));
  }

  findById(id: string): Promise<User | null> {
    return Promise.resolve(this.users.get(id) ?? null);
  }

  findByEmail(email: string): Promise<User | null> {
    return Promise.resolve([...this.users.values()].find((user) => user.email === email) ?? null);
  }

  list(query: UserListQuery): Promise<Page<User>> {
    const items = [...this.users.values()];
    const start = (query.page - 1) * query.limit;
    return Promise.resolve({ items: items.slice(start, start + query.limit), total: items.length });
  }

  updateProfile(id: string, expectedVersion: number, changes: { displayName: string }): Promise<User | null> {
    const user = this.users.get(id);
    if (!user || user.version !== expectedVersion) return Promise.resolve(null);
    const updated = { ...user, ...changes, version: user.version + 1, updatedAt: new Date() };
    this.users.set(id, updated);
    return Promise.resolve(updated);
  }

  changeStatus(id: string, expectedVersion: number, status: UserStatus): Promise<User | null> {
    const user = this.users.get(id);
    if (!user || user.version !== expectedVersion || user.status === status) return Promise.resolve(null);
    const updated: User = {
      ...user,
      status,
      disabledAt: status === 'disabled' ? new Date() : null,
      version: user.version + 1,
    };
    this.users.set(id, updated);
    return Promise.resolve(updated);
  }

  updatePasswordHash(id: string, passwordHash: string): Promise<boolean> {
    const user = this.users.get(id);
    if (!user) return Promise.resolve(false);
    this.users.set(id, { ...user, passwordHash, version: user.version + 1 });
    return Promise.resolve(true);
  }
}

export class InMemorySessionRepository implements SessionRepository {
  readonly sessions = new Map<string, Session>();

  create(input: NewSession): Promise<Session> {
    const now = new Date();
    const session: Session = {
      ...input,
      rotationCount: 0,
      createdAt: now,
      lastUsedAt: now,
      revokedAt: null,
      revokeReason: null,
    };
    this.sessions.set(session.id, session);
    return Promise.resolve(session);
  }

  findById(id: string): Promise<Session | null> {
    return Promise.resolve(this.sessions.get(id) ?? null);
  }

  rotate(input: {
    id: string;
    currentHash: string;
    nextHash: string;
    expiresAt: Date;
  }): Promise<Session | null> {
    const session = this.sessions.get(input.id);
    if (!session || session.revokedAt || session.refreshTokenHash !== input.currentHash)
      return Promise.resolve(null);
    const rotated = {
      ...session,
      refreshTokenHash: input.nextHash,
      expiresAt: input.expiresAt,
      rotationCount: session.rotationCount + 1,
    };
    this.sessions.set(input.id, rotated);
    return Promise.resolve(rotated);
  }

  revoke(id: string, reason: RevokeReason): Promise<boolean> {
    const session = this.sessions.get(id);
    if (!session || session.revokedAt) return Promise.resolve(false);
    this.sessions.set(id, { ...session, revokedAt: new Date(), revokeReason: reason });
    return Promise.resolve(true);
  }

  async revokeAllForUser(
    userId: string,
    reason: RevokeReason,
    options: { exceptSessionId?: string } = {},
  ): Promise<number> {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (
        session.userId === userId &&
        session.id !== options.exceptSessionId &&
        (await this.revoke(session.id, reason))
      ) {
        count += 1;
      }
    }
    return count;
  }

  listActiveForUser(userId: string): Promise<Session[]> {
    return Promise.resolve([...this.sessions.values()].filter((s) => s.userId === userId && !s.revokedAt));
  }
}

/** Tokens are "token:<userId>:<sessionId>"; anything else is rejected like a bad signature. */
export class FakeAccessTokenService implements AccessTokenService {
  issue(claims: AccessTokenClaims): Promise<{ token: string; expiresAt: Date }> {
    return Promise.resolve({
      token: `token:${claims.userId}:${claims.sessionId}`,
      expiresAt: new Date(Date.now() + 900_000),
    });
  }
  verify(token: string): Promise<AccessTokenClaims> {
    const [prefix, userId, sessionId] = token.split(':');
    if (prefix !== 'token' || !userId || !sessionId) {
      return Promise.reject(unauthorized('INVALID_TOKEN', 'The access token is invalid.'));
    }
    return Promise.resolve({ userId, sessionId });
  }
}

/** Accounts port backed by the in-memory user repository. */
export function fakeAccounts(users: InMemoryUserRepository): UserAccountsPort {
  const credentials = (user: User | null) =>
    user
      ? {
          id: user.id,
          email: user.email,
          role: user.role,
          status: user.status,
          passwordHash: user.passwordHash,
        }
      : null;
  return {
    findCredentialsByEmail: async (email) => credentials(await users.findByEmail(email.trim().toLowerCase())),
    findCredentialsById: async (id) => credentials(await users.findById(id)),
    getAccountState: async (id) => {
      const user = await users.findById(id);
      return user ? { id: user.id, role: user.role, status: user.status } : null;
    },
    registerAccount: async (input) => {
      const user = await users.insert({ ...input, email: input.email.toLowerCase(), role: 'member' });
      return { id: user.id, role: user.role, status: user.status };
    },
    updatePasswordHash: async (id, hash) => {
      await users.updatePasswordHash(id, hash);
    },
  };
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  readonly records = new Map<string, IdempotencyRecord & { lockToken: string }>();
  private keyOf = (ref: IdempotencyKeyRef) => `${ref.scope}|${ref.operation}|${ref.key}`;

  claim(ref: IdempotencyKeyRef, claim: { fingerprint: string; lockToken: string }): Promise<boolean> {
    const key = this.keyOf(ref);
    if (this.records.has(key)) return Promise.resolve(false);
    this.records.set(key, {
      fingerprint: claim.fingerprint,
      status: 'in_progress',
      response: null,
      lockToken: claim.lockToken,
    });
    return Promise.resolve(true);
  }
  find(ref: IdempotencyKeyRef): Promise<IdempotencyRecord | null> {
    return Promise.resolve(this.records.get(this.keyOf(ref)) ?? null);
  }
  complete(ref: IdempotencyKeyRef, lockToken: string, response: unknown): Promise<boolean> {
    const record = this.records.get(this.keyOf(ref));
    if (!record || record.lockToken !== lockToken) return Promise.resolve(false);
    this.records.set(this.keyOf(ref), {
      ...record,
      status: 'completed',
      response: JSON.parse(JSON.stringify(response)) as unknown,
    });
    return Promise.resolve(true);
  }
  release(ref: IdempotencyKeyRef, lockToken: string): Promise<void> {
    const record = this.records.get(this.keyOf(ref));
    if (record?.lockToken === lockToken && record.status === 'in_progress')
      this.records.delete(this.keyOf(ref));
    return Promise.resolve();
  }
  deleteExpired(): Promise<number> {
    return Promise.resolve(0);
  }
}
