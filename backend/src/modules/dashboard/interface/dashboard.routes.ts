import { defineRoute, type RouteGroup } from '../../../shared/http/route.js';
import type { DashboardController } from './dashboard.controller.js';
import { getDashboardSummaryRequest, dashboardSummaryResponseSchema } from './dashboard.schemas.js';

export function createDashboardRoutes(basePath: string, controller: DashboardController): RouteGroup {
  return {
    basePath,
    routes: [
      defineRoute({
        method: 'get',
        path: '/summary',
        summary: 'Get consolidated user daily home dashboard summary',
        description:
          'Aggregates real workout, nutrition, water, weight, and activity metrics for today.',
        tags: ['Dashboard'],
        access: { kind: 'authenticated' },
        request: getDashboardSummaryRequest,
        response: {
          status: 200,
          description: 'Consolidated dashboard summary metrics',
          message: 'Dashboard summary retrieved successfully',
          schema: dashboardSummaryResponseSchema,
        },
        handler: (req) => controller.getSummary(req),
      }),
    ],
  };
}
