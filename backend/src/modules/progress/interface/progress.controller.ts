import type { Request } from 'express';
import { requireActor } from '../../../middleware/authenticate.js';
import { getValidated } from '../../../middleware/validate.js';
import type { RouteResult } from '../../../shared/http/route.js';
import type { LogWeightUseCase } from '../application/use-cases/log-weight.js';
import type { GetWeightHistoryUseCase } from '../application/use-cases/get-weight-history.js';
import type { UpdateWeightLogUseCase } from '../application/use-cases/update-weight.js';
import type { DeleteWeightLogUseCase } from '../application/use-cases/delete-weight-log.js';
import type { LogMeasurementUseCase } from '../application/use-cases/log-measurement.js';
import type { GetMeasurementsUseCase } from '../application/use-cases/get-measurements.js';
import type { UpdateMeasurementUseCase } from '../application/use-cases/update-measurement.js';
import type { DeleteMeasurementUseCase } from '../application/use-cases/delete-measurement.js';
import type { GetProgressAnalyticsUseCase } from '../application/use-cases/get-progress-analytics.js';
import type { GetPeriodComparisonUseCase } from '../application/use-cases/get-period-comparison.js';
import type { GetAchievementsUseCase } from '../application/use-cases/get-achievements.js';
import type { GetProgressReportsUseCase } from '../application/use-cases/get-progress-reports.js';
import {
  toWeightLogView,
  toLogWeightResponseView,
  toWeightHistoryView,
  toBodyMeasurementView,
  toLogMeasurementResponseView,
  toMeasurementHistoryView,
  type WeightLogView,
  type LogWeightResponseView,
  type WeightHistoryView,
  type BodyMeasurementView,
  type LogMeasurementResponseView,
  type MeasurementHistoryView,
} from '../application/progress-view.js';
import type { ProgressAnalyticsResult } from '../application/use-cases/get-progress-analytics.js';
import type { PeriodComparisonResult } from '../application/use-cases/get-period-comparison.js';
import type { AchievementItem } from '../application/use-cases/get-achievements.js';
import type { ProgressReportResult } from '../application/use-cases/get-progress-reports.js';
import {
  logWeightRequest,
  getWeightHistoryRequest,
  updateWeightLogRequest,
  deleteWeightLogRequest,
  logMeasurementRequest,
  getMeasurementsRequest,
  updateMeasurementRequest,
  deleteMeasurementRequest,
  getProgressAnalyticsRequest,
  getPeriodComparisonRequest,
  getProgressReportRequest,
} from './progress.schemas.js';

export interface ProgressUseCases {
  logWeight: LogWeightUseCase;
  getWeightHistory: GetWeightHistoryUseCase;
  updateWeight: UpdateWeightLogUseCase;
  deleteWeight: DeleteWeightLogUseCase;
  logMeasurement: LogMeasurementUseCase;
  getMeasurements: GetMeasurementsUseCase;
  updateMeasurement: UpdateMeasurementUseCase;
  deleteMeasurement: DeleteMeasurementUseCase;
  getProgressAnalytics: GetProgressAnalyticsUseCase;
  getPeriodComparison: GetPeriodComparisonUseCase;
  getAchievements: GetAchievementsUseCase;
  getProgressReports: GetProgressReportsUseCase;
}

export type ProgressController = ReturnType<typeof createProgressController>;

export function createProgressController(useCases: ProgressUseCases) {
  return {
    logWeight: async (req: Request): Promise<RouteResult<LogWeightResponseView>> => {
      const actor = requireActor(req);
      const { body } = getValidated(req, logWeightRequest);
      const result = await useCases.logWeight.execute({
        userId: actor.userId,
        weightKg: body.weightKg,
        loggedAt: body.loggedAt ? new Date(body.loggedAt) : undefined,
        source: body.source,
        notes: body.notes,
        clientId: body.clientId,
      });
      return {
        data: toLogWeightResponseView(result),
        status: 201,
        message: 'Weight logged successfully',
      };
    },

    getWeightHistory: async (req: Request): Promise<RouteResult<WeightHistoryView>> => {
      const actor = requireActor(req);
      const { query } = getValidated(req, getWeightHistoryRequest);
      const result = await useCases.getWeightHistory.execute({
        userId: actor.userId,
        range: query.range,
        timezone: query.timezone,
        limit: query.limit,
        offset: query.offset,
      });
      return {
        data: toWeightHistoryView(result),
        message: 'Weight history retrieved successfully',
      };
    },

    updateWeight: async (req: Request): Promise<RouteResult<WeightLogView>> => {
      const actor = requireActor(req);
      const { params, body } = getValidated(req, updateWeightLogRequest);
      const result = await useCases.updateWeight.execute({
        userId: actor.userId,
        id: params.id,
        weightKg: body.weightKg,
        loggedAt: body.loggedAt ? new Date(body.loggedAt) : undefined,
        source: body.source,
        notes: body.notes,
      });
      return {
        data: toWeightLogView(result.log),
        message: 'Weight log updated successfully',
      };
    },

    deleteWeight: async (req: Request): Promise<RouteResult<{ id: string; deleted: boolean }>> => {
      const actor = requireActor(req);
      const { params } = getValidated(req, deleteWeightLogRequest);
      const result = await useCases.deleteWeight.execute({
        userId: actor.userId,
        id: params.id,
      });
      return {
        data: result,
        message: 'Weight log deleted successfully',
      };
    },

    logMeasurement: async (req: Request): Promise<RouteResult<LogMeasurementResponseView>> => {
      const actor = requireActor(req);
      const { body } = getValidated(req, logMeasurementRequest);
      const result = await useCases.logMeasurement.execute({
        userId: actor.userId,
        loggedAt: body.loggedAt ? new Date(body.loggedAt) : undefined,
        waistCm: body.waistCm,
        chestCm: body.chestCm,
        hipCm: body.hipCm,
        armCm: body.armCm,
        neckCm: body.neckCm,
        bodyFatPct: body.bodyFatPct,
        muscleMassKg: body.muscleMassKg,
        notes: body.notes,
        source: body.source,
        clientId: body.clientId,
      });
      return {
        data: toLogMeasurementResponseView(result),
        status: 201,
        message: 'Body measurement logged successfully',
      };
    },

    getMeasurements: async (req: Request): Promise<RouteResult<MeasurementHistoryView>> => {
      const actor = requireActor(req);
      const { query } = getValidated(req, getMeasurementsRequest);
      const result = await useCases.getMeasurements.execute({
        userId: actor.userId,
        limit: query.limit,
        offset: query.offset,
      });
      return {
        data: toMeasurementHistoryView(result),
        message: 'Body measurements retrieved successfully',
      };
    },

    updateMeasurement: async (req: Request): Promise<RouteResult<BodyMeasurementView>> => {
      const actor = requireActor(req);
      const { params, body } = getValidated(req, updateMeasurementRequest);
      const result = await useCases.updateMeasurement.execute({
        userId: actor.userId,
        id: params.id,
        loggedAt: body.loggedAt ? new Date(body.loggedAt) : undefined,
        waistCm: body.waistCm,
        chestCm: body.chestCm,
        hipCm: body.hipCm,
        armCm: body.armCm,
        neckCm: body.neckCm,
        bodyFatPct: body.bodyFatPct,
        muscleMassKg: body.muscleMassKg,
        notes: body.notes,
        source: body.source,
      });
      return {
        data: toBodyMeasurementView(result.measurement),
        message: 'Body measurement updated successfully',
      };
    },

    deleteMeasurement: async (req: Request): Promise<RouteResult<{ id: string; deleted: boolean }>> => {
      const actor = requireActor(req);
      const { params } = getValidated(req, deleteMeasurementRequest);
      const result = await useCases.deleteMeasurement.execute({
        userId: actor.userId,
        id: params.id,
      });
      return {
        data: result,
        message: 'Body measurement deleted successfully',
      };
    },

    getProgressAnalytics: async (req: Request): Promise<RouteResult<ProgressAnalyticsResult>> => {
      const actor = requireActor(req);
      const { query } = getValidated(req, getProgressAnalyticsRequest);
      const result = await useCases.getProgressAnalytics.execute({
        userId: actor.userId,
        metric: query.metric,
        range: query.range,
        timezone: query.timezone,
      });
      return {
        data: result,
        message: 'Progress analytics retrieved successfully',
      };
    },

    getPeriodComparison: async (req: Request): Promise<RouteResult<PeriodComparisonResult>> => {
      const actor = requireActor(req);
      const { query } = getValidated(req, getPeriodComparisonRequest);
      const result = await useCases.getPeriodComparison.execute({
        userId: actor.userId,
        period: query.period,
        timezone: query.timezone,
      });
      return {
        data: result,
        message: 'Period comparison retrieved successfully',
      };
    },

    getAchievements: async (req: Request): Promise<RouteResult<{ achievements: AchievementItem[] }>> => {
      const actor = requireActor(req);
      const result = await useCases.getAchievements.execute({
        userId: actor.userId,
      });
      return {
        data: result,
        message: 'Achievements retrieved successfully',
      };
    },

    getProgressReports: async (req: Request): Promise<RouteResult<ProgressReportResult>> => {
      const actor = requireActor(req);
      const { query } = getValidated(req, getProgressReportRequest);
      const result = await useCases.getProgressReports.execute({
        userId: actor.userId,
        type: query.type,
        date: query.date,
        timezone: query.timezone,
      });
      return {
        data: result,
        message: 'Progress report retrieved successfully',
      };
    },
  };
}

