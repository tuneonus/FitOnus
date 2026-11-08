import type { SqlExecutor } from '../../database/transaction.js';
import type { RouteGroup } from '../../shared/http/route.js';
import { GetDashboardSummaryUseCase } from './application/use-cases/get-dashboard-summary.js';
import { PgDashboardRepository } from './infrastructure/pg-dashboard-repository.js';
import {
  createDashboardController,
  type DashboardController,
} from './interface/dashboard.controller.js';
import { createDashboardRoutes } from './interface/dashboard.routes.js';

export * from './domain/dashboard-summary.js';
export * from './application/ports.js';
export * from './application/use-cases/get-dashboard-summary.js';
export * from './infrastructure/pg-dashboard-repository.js';
export * from './interface/dashboard.schemas.js';
export * from './interface/dashboard.controller.js';
export * from './interface/dashboard.routes.js';

export interface DashboardModule {
  routes: RouteGroup;
  repository: PgDashboardRepository;
  useCase: GetDashboardSummaryUseCase;
  controller: DashboardController;
}

export interface CreateDashboardModuleOptions {
  basePath: string;
  db: SqlExecutor;
}

export function createDashboardModule(options: CreateDashboardModuleOptions): DashboardModule {
  const repository = new PgDashboardRepository(options.db);
  const useCase = new GetDashboardSummaryUseCase(repository);
  const controller = createDashboardController({ getDashboardSummary: useCase });
  const routes = createDashboardRoutes(options.basePath, controller);

  return {
    routes,
    repository,
    useCase,
    controller,
  };
}
