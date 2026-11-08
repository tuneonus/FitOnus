import { beforeEach, describe, expect, it } from 'vitest';
import { DeleteAccountUseCase } from '../../../src/modules/users/application/use-cases/delete-account.js';
import {
  actorFor,
  FakePasswordHasher,
  FakeUnitOfWork,
  InMemoryUserRepository,
} from '../../helpers/fakes.js';

describe('DeleteAccountUseCase', () => {
  let users: InMemoryUserRepository;
  let uow: FakeUnitOfWork;
  let passwordHasher: FakePasswordHasher;
  let useCase: DeleteAccountUseCase;

  const rawPassword = 'my-super-secret-password-123';

  beforeEach(() => {
    users = new InMemoryUserRepository();
    uow = new FakeUnitOfWork();
    passwordHasher = new FakePasswordHasher();
    useCase = new DeleteAccountUseCase({ users, passwordHasher, uow });
  });

  it('deletes user account atomically when current password matches', async () => {
    const passwordHash = await passwordHasher.hash(rawPassword);
    const user = users.add({
      email: 'delete-me@example.com',
      passwordHash,
    });
    const actor = actorFor('member', user.id);

    const result = await useCase.execute(actor, { password: rawPassword });

    expect(result).toEqual({ deletedUserId: user.id });
    expect(await users.findById(user.id)).toBeNull();
    expect(uow.runs).toBe(1);
  });

  it('rejects deletion when password does not match with INVALID_CREDENTIALS', async () => {
    const passwordHash = await passwordHasher.hash(rawPassword);
    const user = users.add({
      email: 'delete-me@example.com',
      passwordHash,
    });
    const actor = actorFor('member', user.id);

    await expect(useCase.execute(actor, { password: 'wrong-password' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      kind: 'unprocessable',
      message: 'The password is incorrect.',
    });

    // Account still exists
    expect(await users.findById(user.id)).not.toBeNull();
    expect(uow.runs).toBe(0);
  });

  it('throws USER_NOT_FOUND when the user account does not exist', async () => {
    const nonExistentUserId = '99999999-9999-4999-8999-999999999999';
    const actor = actorFor('member', nonExistentUserId);

    await expect(useCase.execute(actor, { password: rawPassword })).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      kind: 'not_found',
    });

    expect(uow.runs).toBe(0);
  });

  it('always uses actor.userId from context and never accepts target userId from input', async () => {
    const targetPasswordHash = await passwordHasher.hash(rawPassword);
    const attackerPasswordHash = await passwordHasher.hash('attacker-password');
    const targetUser = users.add({
      email: 'target@example.com',
      passwordHash: targetPasswordHash,
    });
    const attacker = users.add({
      email: 'attacker@example.com',
      passwordHash: attackerPasswordHash,
    });

    // Attacker sends their own valid password, but actor context is attacker
    const attackerActor = actorFor('member', attacker.id);

    const result = await useCase.execute(attackerActor, { password: 'attacker-password' });

    // Only attacker is deleted, target is untouched
    expect(result.deletedUserId).toBe(attacker.id);
    expect(await users.findById(targetUser.id)).not.toBeNull();
    expect(await users.findById(attacker.id)).toBeNull();
  });
});
