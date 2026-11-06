export * from './domain/weight-log.js';
export * from './domain/body-measurement.js';
export * from './domain/ema-calculator.js';
export * from './domain/calendar-bounds.js';
export * from './application/ports.js';
export * from './application/progress-view.js';
export * from './infrastructure/pg-weight-repository.js';
export * from './infrastructure/pg-measurement-repository.js';
export * from './infrastructure/pg-progress-telemetry-adapter.js';

// Application Use Cases
export * from './application/use-cases/log-weight.js';
export * from './application/use-cases/get-weight-history.js';
export * from './application/use-cases/update-weight.js';
export * from './application/use-cases/delete-weight-log.js';
export * from './application/use-cases/log-measurement.js';
export * from './application/use-cases/get-measurements.js';
export * from './application/use-cases/update-measurement.js';
export * from './application/use-cases/delete-measurement.js';
export * from './application/use-cases/get-progress-analytics.js';
export * from './application/use-cases/get-period-comparison.js';
export * from './application/use-cases/get-achievements.js';
export * from './application/use-cases/get-progress-reports.js';

// Interface
export * from './interface/progress.schemas.js';
export * from './interface/progress.controller.js';
export * from './interface/progress.routes.js';

import type { SqlExecutor } from '../../database/transaction.js';
import type { RouteGroup } from '../../shared/http/route.js';
import { PgWeightRepository } from './infrastructure/pg-weight-repository.js';
import { PgMeasurementRepository } from './infrastructure/pg-measurement-repository.js';
import { PgProgressTelemetryAdapter } from './infrastructure/pg-progress-telemetry-adapter.js';
import { LogWeightUseCase } from './application/use-cases/log-weight.js';
import { GetWeightHistoryUseCase } from './application/use-cases/get-weight-history.js';
import { UpdateWeightLogUseCase } from './application/use-cases/update-weight.js';
import { DeleteWeightLogUseCase } from './application/use-cases/delete-weight-log.js';
import { LogMeasurementUseCase } from './application/use-cases/log-measurement.js';
import { GetMeasurementsUseCase } from './application/use-cases/get-measurements.js';
import { UpdateMeasurementUseCase } from './application/use-cases/update-measurement.js';
import { DeleteMeasurementUseCase } from './application/use-cases/delete-measurement.js';
import { GetProgressAnalyticsUseCase } from './application/use-cases/get-progress-analytics.js';
import { GetPeriodComparisonUseCase } from './application/use-cases/get-period-comparison.js';
import { GetAchievementsUseCase } from './application/use-cases/get-achievements.js';
import { GetProgressReportsUseCase } from './application/use-cases/get-progress-reports.js';
import { createProgressController, type ProgressController } from './interface/progress.controller.js';
import { createProgressRoutes } from './interface/progress.routes.js';

export interface ProgressModule {
  routes: RouteGroup;
  weightRepo: PgWeightRepository;
  measRepo: PgMeasurementRepository;
  telemetryPort: PgProgressTelemetryAdapter;
  controller: ProgressController;
}

export interface CreateProgressModuleOptions {
  basePath?: string;
  db: SqlExecutor;
}

export function createProgressModule(deps: CreateProgressModuleOptions): ProgressModule {
  const weightRepo = new PgWeightRepository(deps.db);
  const measRepo = new PgMeasurementRepository(deps.db);
  const telemetryPort = new PgProgressTelemetryAdapter(deps.db);

  const controller = createProgressController({
    logWeight: new LogWeightUseCase(weightRepo),
    getWeightHistory: new GetWeightHistoryUseCase(weightRepo),
    updateWeight: new UpdateWeightLogUseCase(weightRepo),
    deleteWeight: new DeleteWeightLogUseCase(weightRepo),
    logMeasurement: new LogMeasurementUseCase(measRepo),
    getMeasurements: new GetMeasurementsUseCase(measRepo),
    updateMeasurement: new UpdateMeasurementUseCase(measRepo),
    deleteMeasurement: new DeleteMeasurementUseCase(measRepo),
    getProgressAnalytics: new GetProgressAnalyticsUseCase(weightRepo, telemetryPort),
    getPeriodComparison: new GetPeriodComparisonUseCase(weightRepo, telemetryPort),
    getAchievements: new GetAchievementsUseCase(weightRepo, telemetryPort),
    getProgressReports: new GetProgressReportsUseCase(weightRepo, telemetryPort),
  });

  const basePath = deps.basePath ?? '/api/v1/progress';
  const routes = createProgressRoutes(basePath, controller);

  return {
    routes,
    weightRepo,
    measRepo,
    telemetryPort,
    controller,
  };
}
