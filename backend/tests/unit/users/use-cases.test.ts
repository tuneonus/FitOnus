import { beforeEach, describe, expect, it } from 'vitest';
import { ChangeUserStatusUseCase } from '../../../src/modules/users/application/use-cases/change-user-status.js';
import { CreateUserUseCase } from '../../../src/modules/users/application/use-cases/create-user.js';
import { GetUserUseCase } from '../../../src/modules/users/application/use-cases/get-user.js';
import { ListUsersUseCase } from '../../../src/modules/users/application/use-cases/list-users.js';
import { UpdateUserProfileUseCase } from '../../../src/modules/users/application/use-cases/update-user-profile.js';
import { IdempotencyService } from '../../../src/shared/idempotency/idempotency.js';
import {
  actorFor,
  FakeKeyedHasher,
  FakePasswordHasher,
  FakeUnitOfWork,
  InMemoryIdempotencyStore,
  InMemoryUserRepository,
} from '../../helpers/fakes.js';

let users: InMemoryUserRepository;
let uow: FakeUnitOfWork;
let createUser: CreateUserUseCase;

beforeEach(() => {
  users = new InMemoryUserRepository();
  uow = new FakeUnitOfWork();
  createUser = new CreateUserUseCase({
    users,
    uow,
    passwordHasher: new FakePasswordHasher(),
    idempotency: new IdempotencyService(new InMemoryIdempotencyStore(), new FakeKeyedHasher(), {
      ttlSeconds: 3600,
      leaseSeconds: 30,
    }),
  });
});

const input = {
  email: ' New@Example.org ',
  displayName: ' New  User ',
  password: 'a sufficiently long password',
};

describe('CreateUserUseCase', () => {
  it('requires users:create', async () => {
    await expect(createUser.execute(actorFor('member'), input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(users.users.size).toBe(0);
  });

  it('normalises input, hashes the password and never returns the hash', async () => {
    const { value } = await createUser.execute(actorFor('admin'), input);
    expect(value).toMatchObject({
      email: 'new@example.org',
      displayName: 'New User',
      role: 'member',
      version: 1,
    });
    expect(value).not.toHaveProperty('passwordHash');
    expect([...users.users.values()][0]!.passwordHash).toBe(`hashed:${input.password}`);
    expect(uow.runs).toBe(1);
  });

  it('rejects weak passwords before touching storage', async () => {
    await expect(
      createUser.execute(actorFor('admin'), { ...input, password: 'short' }),
    ).rejects.toMatchObject({
      code: 'PASSWORD_POLICY_VIOLATION',
    });
    expect(users.users.size).toBe(0);
  });

  it('replays an idempotent retry instead of creating a duplicate', async () => {
    const admin = actorFor('admin');
    const first = await createUser.execute(admin, input, 'retry-key-0001');
    const second = await createUser.execute(admin, input, 'retry-key-0001');
    expect(second.replayed).toBe(true);
    expect(second.value).toEqual(first.value);
    expect(users.users.size).toBe(1);
  });
});

describe('read, update and status use cases', () => {
  it('lets users read themselves but not others without users:read', async () => {
    const getUser = new GetUserUseCase({ users });
    const alice = users.add({ email: 'alice@example.org' });
    const bob = users.add({ email: 'bob@example.org' });

    await expect(getUser.execute(actorFor('member', alice.id), alice.id)).resolves.toMatchObject({
      id: alice.id,
    });
    await expect(getUser.execute(actorFor('member', alice.id), bob.id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(getUser.execute(actorFor('admin'), bob.id)).resolves.toMatchObject({ id: bob.id });
    await expect(
      getUser.execute(actorFor('admin'), '00000000-0000-4000-8000-000000000000'),
    ).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
    });
  });

  it('lists only with users:read', async () => {
    const listUsers = new ListUsersUseCase({ users });
    users.add({ email: 'one@example.org' });
    const query = { page: 1, limit: 10, sort: 'createdAt' as const, order: 'desc' as const };
    await expect(listUsers.execute(actorFor('member'), query)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(listUsers.execute(actorFor('admin'), query)).resolves.toMatchObject({ total: 1 });
  });

  it('detects stale versions on profile updates', async () => {
    const update = new UpdateUserProfileUseCase({ users });
    const alice = users.add({ email: 'alice@example.org' });
    const actor = actorFor('member', alice.id);

    await expect(
      update.execute(actor, alice.id, { displayName: 'Alice', version: 1 }),
    ).resolves.toMatchObject({
      displayName: 'Alice',
      version: 2,
    });
    await expect(update.execute(actor, alice.id, { displayName: 'Again', version: 1 })).rejects.toMatchObject(
      {
        code: 'VERSION_CONFLICT',
        details: { currentVersion: 2 },
      },
    );
  });

  it('changes status only with permission and never for oneself', async () => {
    const changeStatus = new ChangeUserStatusUseCase({ users });
    const admin = actorFor('admin');
    const target = users.add({ email: 'target@example.org' });

    await expect(changeStatus.execute(actorFor('member'), target.id, 'disabled')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      changeStatus.execute(actorFor('admin', target.id), target.id, 'disabled'),
    ).rejects.toMatchObject({
      code: 'CANNOT_CHANGE_OWN_STATUS',
    });
    await expect(changeStatus.execute(admin, target.id, 'disabled')).resolves.toMatchObject({
      status: 'disabled',
    });
    await expect(changeStatus.execute(admin, target.id, 'disabled')).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
  });
});
