import type { SqlExecutor } from '../../database/transaction.js';
import type { UnitOfWork } from '../../shared/application/unit-of-work.js';
import type { RouteGroup } from '../../shared/http/route.js';
import type { IdempotencyService } from '../../shared/idempotency/idempotency.js';
import type { PasswordHasher } from '../../shared/security/password-hasher.js';
import { createUserAccountsApi, type UserAccountsApi } from './application/accounts.js';
import { ChangeUserStatusUseCase } from './application/use-cases/change-user-status.js';
import { CreateUserUseCase } from './application/use-cases/create-user.js';
import { DeleteAccountUseCase } from './application/use-cases/delete-account.js';
import { GetUserUseCase } from './application/use-cases/get-user.js';
import { ListUsersUseCase } from './application/use-cases/list-users.js';
import { UpdateUserProfileUseCase } from './application/use-cases/update-user-profile.js';
import { PgUserRepository } from './infrastructure/pg-user-repository.js';
import { createUsersController } from './interface/users.controller.js';
import { createUsersRoutes } from './interface/users.routes.js';

import type { UserRepository } from './application/ports.js';

export type { AccountCredentials, AccountState, UserAccountsApi } from './application/accounts.js';
export type { UserRepository } from './application/ports.js';
export { toUserView } from './application/user-view.js';
export type { UserView } from './application/user-view.js';
export { assertStatusTransition, type User, type UserStatus } from './domain/user.js';

export interface UsersModule {
  routes: RouteGroup;
  /** In-process API for other modules; never exposed over HTTP. */
  accounts: UserAccountsApi;
  repository: UserRepository;
}

/** Composition root of the users module: wires adapters into use cases into HTTP routes. */
export function createUsersModule(deps: {
  basePath: string;
  db: SqlExecutor;
  uow: UnitOfWork;
  passwordHasher: PasswordHasher;
  idempotency: IdempotencyService;
}): UsersModule {
  const users = new PgUserRepository(deps.db);
  const controller = createUsersController({
    createUser: new CreateUserUseCase({
      users,
      uow: deps.uow,
      passwordHasher: deps.passwordHasher,
      idempotency: deps.idempotency,
    }),
    getUser: new GetUserUseCase({ users }),
    listUsers: new ListUsersUseCase({ users }),
    updateProfile: new UpdateUserProfileUseCase({ users }),
    changeStatus: new ChangeUserStatusUseCase({ users }),
    deleteAccount: new DeleteAccountUseCase({
      users,
      passwordHasher: deps.passwordHasher,
      uow: deps.uow,
    }),
  });

  return {
    routes: createUsersRoutes(deps.basePath, controller),
    accounts: createUserAccountsApi(users),
    repository: users,
  };
}
