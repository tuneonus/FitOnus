import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { AppConfig } from './config/env.js';
import { API_PREFIX, type Container } from './container.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestContext } from './middleware/request-context.js';
import { buildOpenApiDocument } from './shared/http/openapi.js';
import { buildRouter } from './shared/http/route.js';
import type { Logger } from './shared/logging/logger.js';
import './shared/types/express.js';

export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = [
  'https://fit-onus.vercel.app',
];

export function corsMiddleware(origins: readonly string[]) {
  const allowed = new Set([...origins, ...DEFAULT_ALLOWED_ORIGINS]);
  return cors({
    // Unlisted origins get no CORS headers (the browser blocks them); requests without Origin pass.
    origin: (origin, callback) => callback(null, origin === undefined || allowed.has(origin)),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Accept',
      'Idempotency-Key',
      'X-Request-Id',
      'X-Panel-Id',
    ],
    exposedHeaders: ['X-Request-Id', 'Idempotent-Replayed', 'RateLimit', 'RateLimit-Policy', 'Retry-After'],
    credentials: true,
    maxAge: 600,
  });
}

/**
 * Builds the Express application without listening, so tests can drive it with supertest.
 * Middleware order matters: request id/logging → security headers → CORS → body parsing →
 * rate limiting → routes → 404 → error envelope.
 */
export function createApp(deps: { config: AppConfig; logger: Logger; container: Container }): Express {
  const { config, logger, container } = deps;
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.http.trustProxy);

  app.use(requestContext(logger));
  app.use(helmet());
  app.use(corsMiddleware(config.http.corsOrigins));
  app.use(express.json({ limit: config.http.bodyLimit, strict: true }));
  app.use(container.rateLimiters.global);

  for (const group of container.routeGroups) {
    app.use(group.basePath, buildRouter(group.routes, { authenticate: container.authenticate }));
  }

  const openApiDocument = buildOpenApiDocument(container.routeGroups, {
    title: 'Generic Backend API',
    version: '0.1.0',
    description: 'Reusable Express + PostgreSQL backend starter.',
  });
  app.get(`${API_PREFIX}/openapi.json`, (_req, res) => {
    res.json(openApiDocument);
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
