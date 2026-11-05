import { assertPermission, type Actor } from '../../../../shared/auth/actor.js';
import type { Role } from '../../../../shared/auth/permissions.js';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.js';
import type {
  CompleteIdempotentWork,
  IdempotencyService,
  IdempotentResult,
} from '../../../../shared/idempotency/idempotency.js';
import type { PasswordHasher } from '../../../../shared/security/password-hasher.js';
import { assertPasswordPolicy } from '../../../../shared/security/password-policy.js';
import { normalizeDisplayName, normalizeEmail } from '../../domain/user.js';
import type { UserRepository } from '../ports.js';
import { toUserView, type UserView } from '../user-view.js';

export interface CreateUserInput {
  email: string;
  displayName: string;
  password: string;
  role?: Role | undefined;
}

export class CreateUserUseCase {
  constructor(
    private readonly deps: {
      users: UserRepository;
      uow: UnitOfWork;
      passwordHasher: PasswordHasher;
      idempotency: IdempotencyService;
    },
  ) {}

  async execute(
    actor: Actor,
    input: CreateUserInput,
    idempotencyKey?: string,
  ): Promise<IdempotentResult<UserView>> {
    assertPermission(actor, 'users:create');
    const role = input.role ?? 'member';
    // Granting anything beyond the default role is a separate, explicit permission.
    if (role !== 'member') assertPermission(actor, 'users:assign-role');

    const email = normalizeEmail(input.email);
    const displayName = normalizeDisplayName(input.displayName);
    assertPasswordPolicy(input.password);

    const create = async (complete?: CompleteIdempotentWork<UserView>): Promise<UserView> => {
      // Hashing is slow; do it before opening the transaction.
      const passwordHash = await this.deps.passwordHasher.hash(input.password);
      return this.deps.uow.run(async () => {
        const user = await this.deps.users.insert({ email, displayName, passwordHash, role });
        const view = toUserView(user);
        await complete?.(view);
        return view;
      });
    };

    if (!idempotencyKey) return { value: await create(), replayed: false };

    return this.deps.idempotency.execute(
      { scope: actor.userId, operation: 'users.create', key: idempotencyKey },
      { email, displayName, role, password: input.password },
      create,
    );
  }
}
