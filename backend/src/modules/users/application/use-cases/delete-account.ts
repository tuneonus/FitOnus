import type { Actor } from '../../../../shared/auth/actor.js';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.js';
import { notFound, unprocessable } from '../../../../shared/errors/app-error.js';
import type { PasswordHasher } from '../../../../shared/security/password-hasher.js';
import type { UserRepository } from '../ports.js';

export interface DeleteAccountInput {
  password: string;
}

export interface DeleteAccountResult {
  deletedUserId: string;
}

export class DeleteAccountUseCase {
  constructor(
    private readonly deps: {
      users: UserRepository;
      passwordHasher: PasswordHasher;
      uow: UnitOfWork;
    },
  ) {}

  async execute(actor: Actor, input: DeleteAccountInput): Promise<DeleteAccountResult> {
    const user = await this.deps.users.findById(actor.userId);
    if (!user) {
      throw notFound('USER_NOT_FOUND', 'User account not found.');
    }

    const valid = await this.deps.passwordHasher.verify(user.passwordHash, input.password);
    if (!valid) {
      throw unprocessable('INVALID_CREDENTIALS', 'The password is incorrect.');
    }

    return this.deps.uow.run(async () => {
      const deleted = await this.deps.users.deleteById(actor.userId);
      if (!deleted) {
        throw notFound('USER_NOT_FOUND', 'User account not found.');
      }
      return { deletedUserId: actor.userId };
    });
  }
}
