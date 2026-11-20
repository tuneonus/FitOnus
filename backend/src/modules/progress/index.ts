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

// Progress photos (private member media)
export * from './domain/progress-photo.js';
export type {
  ProgressPhotoGallery,
  ProgressPhotoListItem,
  ProgressPhotoUploadResult,
  ProgressPhotoView,
} from './application/photo-view.js';

import type { SqlExecutor } from '../../database/transaction.js';
import type { RouteGroup } from '../../shared/http/route.js';
import type { ImageLogger } from '../../shared/images/public-image-check.js';
import type { PrivateMedia } from '../../shared/private-media/index.js';
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
import { PgProgressPhotoRepository } from './infrastructure/pg-progress-photo-repository.js';
import { DeleteProgressPhotoUseCase } from './application/use-cases/delete-progress-photo.js';
import { GetProgressPhotoUseCase } from './application/use-cases/get-progress-photo.js';
import { ListProgressPhotosUseCase } from './application/use-cases/list-progress-photos.js';
import { UploadProgressPhotoUseCase } from './application/use-cases/upload-progress-photo.js';
import { createProgressPhotoController } from './interface/photo.controller.js';
import { createProgressPhotoRoutes, type PhotoRouteLimiters } from './interface/photo.routes.js';

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
  /** The private member-photo storage. Null/omitted when it is not configured: photo upload and listing answer 503. */
  privateMedia?: PrivateMedia | null;
  /** The upload budget for progress photos. Omitted in tests that do not exercise rate limiting. */
  limiters?: PhotoRouteLimiters;
  logger?: ImageLogger;
  /** Replaceable clock (tests). */
  now?: () => Date;
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

  const photos = new PgProgressPhotoRepository(deps.db);
  const media = deps.privateMedia ?? null;
  const photoController = createProgressPhotoController({
    list: new ListProgressPhotosUseCase({ photos, media, logger: deps.logger }),
    get: new GetProgressPhotoUseCase({ photos, media }),
    upload: new UploadProgressPhotoUseCase({
      photos,
      media,
      logger: deps.logger,
      ...(deps.now ? { now: deps.now } : {}),
    }),
    delete: new DeleteProgressPhotoUseCase({ photos, media }),
  });

  const basePath = deps.basePath ?? '/api/v1/progress';
  const progressRoutes = createProgressRoutes(basePath, controller);
  const routes: RouteGroup = {
    basePath: progressRoutes.basePath,
    routes: [...progressRoutes.routes, ...createProgressPhotoRoutes(photoController, deps.limiters)],
  };

  return {
    routes,
    weightRepo,
    measRepo,
    telemetryPort,
    controller,
  };
}
