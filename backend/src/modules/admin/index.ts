import type { Database } from '../../database/transaction.js';
import type { PasswordHasher } from '../../shared/security/password-hasher.js';
import type { SessionIssuer, SessionRepository, SessionsUseCases, UserAccountsPort } from '../auth/index.js';
import type { UserRepository } from '../users/index.js';
import { AdminChangePasswordUseCase } from './application/use-cases/admin-change-password.js';
import { AdminLoginUseCase } from './application/use-cases/admin-login.js';
import { AdminChangeUserStatusUseCase } from './application/use-cases/change-user-status.js';
import { GetAdminUserUseCase } from './application/use-cases/get-admin-user.js';
import { GetDashboardStatsUseCase } from './application/use-cases/get-dashboard-stats.js';
import { ListAdminUsersUseCase } from './application/use-cases/list-admin-users.js';
import { ListAuditLogsUseCase } from './application/use-cases/list-audit-logs.js';
import { PgAdminRepository } from './infrastructure/pg-admin-repository.js';
import { createAdminController } from './interface/admin.controller.js';
import { createAdminRoutes, type AdminRateLimiters } from './interface/admin.routes.js';

export interface AdminModuleDependencies {
  basePath: string;
  db: Database;
  accounts: UserAccountsPort;
  users: UserRepository;
  sessions: SessionRepository;
  sessionsUseCases: SessionsUseCases;
  sessionIssuer: SessionIssuer;
  passwordHasher: PasswordHasher;
  limiters: AdminRateLimiters;
  isProduction: boolean;
}

export function createAdminModule(deps: AdminModuleDependencies) {
  const adminRepo = new PgAdminRepository(deps.db);

  const useCases = {
    login: new AdminLoginUseCase({
      accounts: deps.accounts,
      passwordHasher: deps.passwordHasher,
      issuer: deps.sessionIssuer,
      adminRepo,
    }),
    changePassword: new AdminChangePasswordUseCase({
      accounts: deps.accounts,
      sessions: deps.sessions,
      passwordHasher: deps.passwordHasher,
      adminRepo,
    }),
    getDashboardStats: new GetDashboardStatsUseCase({ adminRepo }),
    listUsers: new ListAdminUsersUseCase({ adminRepo }),
    getAdminUser: new GetAdminUserUseCase({ adminRepo }),
    changeUserStatus: new AdminChangeUserStatusUseCase({
      users: deps.users,
      sessions: deps.sessions,
      adminRepo,
    }),
    listAuditLogs: new ListAuditLogsUseCase({ adminRepo }),
    sessions: deps.sessionsUseCases,
  };

  const controller = createAdminController(useCases, deps.isProduction);
  const routes = createAdminRoutes(deps.basePath, controller, deps.limiters);

  return {
    routes,
    repository: adminRepo,
    useCases,
  };
}
