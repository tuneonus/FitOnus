import { defineRoute, type RouteGroup } from '../../../shared/http/route.js';
import type { ProgressController } from './progress.controller.js';
import {
  weightLogViewSchema,
  logWeightResponseSchema,
  weightHistoryResponseSchema,
  bodyMeasurementViewSchema,
  logMeasurementResponseSchema,
  measurementHistoryResponseSchema,
  deleteResultSchema,
  progressAnalyticsResponseSchema,
  periodComparisonResponseSchema,
  achievementsResponseSchema,
  progressReportResponseSchema,
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

const tags = ['Progress'];

export function createProgressRoutes(basePath: string, controller: ProgressController): RouteGroup {
  return {
    basePath,
    routes: [
      // 1. Log weight
      defineRoute({
        method: 'post',
        path: '/weight',
        summary: 'Log weight entry',
        description:
          'Record a new body weight measurement with client idempotency and profile synchronization.',
        tags,
        access: { kind: 'authenticated' },
        request: logWeightRequest,
        response: {
          status: 201,
          description: 'Logged weight record',
          message: 'Weight logged successfully',
          schema: logWeightResponseSchema,
        },
        errorStatuses: [400, 401],
        handler: controller.logWeight,
      }),

      // 2. Get weight history
      defineRoute({
        method: 'get',
        path: '/weight',
        summary: 'Get weight tracking history',
        description: 'Retrieve time-series smoothed points and paginated entries for weight tracking.',
        tags,
        access: { kind: 'authenticated' },
        request: getWeightHistoryRequest,
        response: {
          status: 200,
          description: 'Weight history and trend',
          message: 'Weight history retrieved successfully',
          schema: weightHistoryResponseSchema,
        },
        errorStatuses: [401],
        handler: controller.getWeightHistory,
      }),

      // 3. Update weight log (PUT)
      defineRoute({
        method: 'put',
        path: '/weight/:id',
        summary: 'Update weight log',
        description: 'Update a user-owned weight log by ID.',
        tags,
        access: { kind: 'authenticated' },
        request: updateWeightLogRequest,
        response: {
          status: 200,
          description: 'Updated weight log',
          message: 'Weight log updated successfully',
          schema: weightLogViewSchema,
        },
        errorStatuses: [400, 401, 404],
        handler: controller.updateWeight,
      }),

      // 4. Partially update weight log (PATCH)
      defineRoute({
        method: 'patch',
        path: '/weight/:id',
        summary: 'Partially update weight log',
        description: 'Partially update a user-owned weight log by ID.',
        tags,
        access: { kind: 'authenticated' },
        request: updateWeightLogRequest,
        response: {
          status: 200,
          description: 'Updated weight log',
          message: 'Weight log updated successfully',
          schema: weightLogViewSchema,
        },
        errorStatuses: [400, 401, 404],
        handler: controller.updateWeight,
      }),

      // 5. Delete weight log
      defineRoute({
        method: 'delete',
        path: '/weight/:id',
        summary: 'Delete weight log',
        description: 'Soft-delete a user-owned weight log entry.',
        tags,
        access: { kind: 'authenticated' },
        request: deleteWeightLogRequest,
        response: {
          status: 200,
          description: 'Deletion confirmation',
          message: 'Weight log deleted successfully',
          schema: deleteResultSchema,
        },
        errorStatuses: [401, 404],
        handler: controller.deleteWeight,
      }),

      // 6. Log body measurements
      defineRoute({
        method: 'post',
        path: '/measurements',
        summary: 'Log body measurements',
        description: 'Record circumference and body composition measurements.',
        tags,
        access: { kind: 'authenticated' },
        request: logMeasurementRequest,
        response: {
          status: 201,
          description: 'Logged body measurement',
          message: 'Body measurement logged successfully',
          schema: logMeasurementResponseSchema,
        },
        errorStatuses: [400, 401],
        handler: controller.logMeasurement,
      }),

      // 7. Get body measurements history
      defineRoute({
        method: 'get',
        path: '/measurements',
        summary: 'Get body measurements history',
        description: 'Retrieve latest body measurements and historical list with diffs.',
        tags,
        access: { kind: 'authenticated' },
        request: getMeasurementsRequest,
        response: {
          status: 200,
          description: 'Body measurements list',
          message: 'Body measurements retrieved successfully',
          schema: measurementHistoryResponseSchema,
        },
        errorStatuses: [401],
        handler: controller.getMeasurements,
      }),

      // 8. Update body measurement (PUT)
      defineRoute({
        method: 'put',
        path: '/measurements/:id',
        summary: 'Update body measurement',
        description: 'Update a user-owned body measurement entry.',
        tags,
        access: { kind: 'authenticated' },
        request: updateMeasurementRequest,
        response: {
          status: 200,
          description: 'Updated body measurement',
          message: 'Body measurement updated successfully',
          schema: bodyMeasurementViewSchema,
        },
        errorStatuses: [400, 401, 404],
        handler: controller.updateMeasurement,
      }),

      // 9. Partially update body measurement (PATCH)
      defineRoute({
        method: 'patch',
        path: '/measurements/:id',
        summary: 'Partially update body measurement',
        description: 'Partially update a user-owned body measurement entry.',
        tags,
        access: { kind: 'authenticated' },
        request: updateMeasurementRequest,
        response: {
          status: 200,
          description: 'Updated body measurement',
          message: 'Body measurement updated successfully',
          schema: bodyMeasurementViewSchema,
        },
        errorStatuses: [400, 401, 404],
        handler: controller.updateMeasurement,
      }),

      // 10. Delete body measurement
      defineRoute({
        method: 'delete',
        path: '/measurements/:id',
        summary: 'Delete body measurement',
        description: 'Soft-delete a user-owned body measurement entry.',
        tags,
        access: { kind: 'authenticated' },
        request: deleteMeasurementRequest,
        response: {
          status: 200,
          description: 'Deletion confirmation',
          message: 'Body measurement deleted successfully',
          schema: deleteResultSchema,
        },
        errorStatuses: [401, 404],
        handler: controller.deleteMeasurement,
      }),

      // 11. Progress analytics
      defineRoute({
        method: 'get',
        path: '/analytics',
        summary: 'Get progress analytics time-series',
        description:
          'Retrieve time-bucketed trend series, goals, and change deltas for specified health metric.',
        tags,
        access: { kind: 'authenticated' },
        request: getProgressAnalyticsRequest,
        response: {
          status: 200,
          description: 'Progress analytics details',
          message: 'Progress analytics retrieved successfully',
          schema: progressAnalyticsResponseSchema,
        },
        errorStatuses: [400, 401],
        handler: controller.getProgressAnalytics,
      }),

      // 12. Period comparison
      defineRoute({
        method: 'get',
        path: '/comparison',
        summary: 'Get period comparison',
        description: 'Compare progress metrics across weeks or months.',
        tags,
        access: { kind: 'authenticated' },
        request: getPeriodComparisonRequest,
        response: {
          status: 200,
          description: 'Period comparison details',
          message: 'Period comparison retrieved successfully',
          schema: periodComparisonResponseSchema,
        },
        errorStatuses: [400, 401],
        handler: controller.getPeriodComparison,
      }),

      // 13. Achievements
      defineRoute({
        method: 'get',
        path: '/achievements',
        summary: 'Get earned achievements and milestones',
        description: 'Retrieve personal records, consistency streaks, and milestone achievements.',
        tags,
        access: { kind: 'authenticated' },
        response: {
          status: 200,
          description: 'Earned achievements',
          message: 'Achievements retrieved successfully',
          schema: achievementsResponseSchema,
        },
        errorStatuses: [401],
        handler: controller.getAchievements,
      }),

      // 14. Progress reports
      defineRoute({
        method: 'get',
        path: '/reports',
        summary: 'Get progress reports',
        description: 'Deterministic weekly or monthly progress report with highlights and suggestions.',
        tags,
        access: { kind: 'authenticated' },
        request: getProgressReportRequest,
        response: {
          status: 200,
          description: 'Progress report details',
          message: 'Progress report retrieved successfully',
          schema: progressReportResponseSchema,
        },
        errorStatuses: [400, 401],
        handler: controller.getProgressReports,
      }),
    ],
  };
}
