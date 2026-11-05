import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
import { defineRoute, type RouteGroup } from '../../shared/http/route.js';

const statusSchema = z.object({ status: z.literal('ok') });

/**
 * Liveness: the process is up (restart it if this fails).
 * Readiness: the process can serve traffic: database reachable and not shutting down.
 */
export function createHealthRoutes(deps: {
  checkReady: () => Promise<void>;
  isShuttingDown: () => boolean;
}): RouteGroup {
  return {
    basePath: '/health',
    routes: [
      defineRoute({
        method: 'get',
        path: '/live',
        summary: 'Liveness probe',
        tags: ['Health'],
        access: { kind: 'public' },
        response: { status: 200, description: 'Process is alive', message: 'OK', schema: statusSchema },
        handler: () => Promise.resolve({ data: { status: 'ok' as const } }),
      }),
      defineRoute({
        method: 'get',
        path: '/ready',
        summary: 'Readiness probe (checks PostgreSQL)',
        tags: ['Health'],
        access: { kind: 'public' },
        response: {
          status: 200,
          description: 'Ready to serve traffic',
          message: 'Ready',
          schema: statusSchema,
        },
        errorStatuses: [503],
        handler: async () => {
          const unavailable = new AppError('unavailable', 'SERVICE_UNAVAILABLE', 'The service is not ready.');
          if (deps.isShuttingDown()) throw unavailable;
          try {
            await deps.checkReady();
          } catch (error) {
            throw new AppError('unavailable', 'SERVICE_UNAVAILABLE', 'The service is not ready.', undefined, {
              cause: error,
            });
          }
          return { data: { status: 'ok' as const } };
        },
      }),
    ],
  };
}
