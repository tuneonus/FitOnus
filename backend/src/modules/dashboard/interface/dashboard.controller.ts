import type { Request } from 'express';
import { requireActor } from '../../../middleware/authenticate.js';
import { getValidated } from '../../../middleware/validate.js';
import type { RouteResult } from '../../../shared/http/route.js';
import type { GetDashboardSummaryUseCase } from '../application/use-cases/get-dashboard-summary.js';
import {
  getDashboardSummaryRequest,
  type DashboardSummaryResponse,
} from './dashboard.schemas.js';

export interface DashboardController {
  getSummary(req: Request): Promise<RouteResult<DashboardSummaryResponse>>;
}

export function createDashboardController(deps: {
  getDashboardSummary: GetDashboardSummaryUseCase;
}): DashboardController {
  return {
    async getSummary(req: Request): Promise<RouteResult<DashboardSummaryResponse>> {
      const actor = requireActor(req);
      const { query } = getValidated(req, getDashboardSummaryRequest);
      const data = await deps.getDashboardSummary.execute({
        userId: actor.userId,
        timezone: query.timezone,
      });

      return {
        status: 200,
        message: 'Dashboard summary retrieved successfully',
        data,
      };
    },
  };
}
