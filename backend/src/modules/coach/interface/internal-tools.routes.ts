import type { Request, RequestHandler, Response } from 'express';
import { jwtVerify } from 'jose';
import { createActor } from '../../../shared/auth/actor.js';
import { AppError } from '../../../shared/errors/app-error.js';
import { defineRoute, type RouteGroup } from '../../../shared/http/route.js';
import type { InternalToolsController } from './internal-tools.controller.js';
import {
  getExerciseDetailsInputSchema,
  getExerciseDetailsResponseSchema,
  getFitnessProfileInputSchema,
  getFitnessProfileResponseSchema,
  getNutritionSummaryInputSchema,
  getNutritionSummaryResponseSchema,
  getRecentWorkoutsInputSchema,
  getRecentWorkoutsResponseSchema,
  getWeightTrendInputSchema,
  getWeightTrendResponseSchema,
  retrieveFitnessKnowledgeInputSchema,
  retrieveFitnessKnowledgeResponseSchema,
  searchExercisesInputSchema,
  searchExercisesResponseSchema,
} from './internal-tools.schemas.js';

export const INTERNAL_TOOL_TOKEN_ISSUER = 'onusfit-ai-backend';
export const INTERNAL_TOOL_TOKEN_AUDIENCE = 'onusfit-node-api';
export const INTERNAL_TOOL_TOKEN_SCOPE = 'ai:tools:read';
const MAX_TOKEN_LIFETIME_SECONDS = 60;
const CLOCK_SKEW_SECONDS = 5;

export class ToolReplayCache {
  private seen = new Map<string, number>();

  checkAndStore(jti: string, expiresAt: number, now: number = Date.now() / 1000): boolean {
    for (const [k, exp] of this.seen.entries()) {
      if (exp <= now) this.seen.delete(k);
    }
    if (this.seen.has(jti)) return false;
    this.seen.set(jti, expiresAt);
    return true;
  }

  clear(): void {
    this.seen.clear();
  }
}

export const toolReplayCache = new ToolReplayCache();

function unauthorizedError(message = 'Invalid service token.'): AppError {
  return new AppError('unauthorized', 'INVALID_TOKEN', message);
}

/**
 * Machine-to-machine authentication middleware for internal tool endpoints.
 * Verifies short-lived HS256 service JWTs minted by the Python AI backend.
 * Populates req.actor with the authenticated user ID from payload.sub.
 */
export function createInternalServiceAuth(serviceSecret: string): RequestHandler {
  const secretKey = new TextEncoder().encode(serviceSecret);

  return async (req: Request, _res: Response, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw unauthorizedError('Missing or malformed authorization header.');
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw unauthorizedError('Empty bearer token.');
    }

    try {
      const { payload } = await jwtVerify(token, secretKey, {
        algorithms: ['HS256'],
        issuer: INTERNAL_TOOL_TOKEN_ISSUER,
        audience: INTERNAL_TOOL_TOKEN_AUDIENCE,
        clockTolerance: CLOCK_SKEW_SECONDS,
      });

      if (payload.scope !== INTERNAL_TOOL_TOKEN_SCOPE) {
        throw unauthorizedError('Invalid service token scope.');
      }

      if (!payload.sub || typeof payload.sub !== 'string' || !payload.sub.trim()) {
        throw unauthorizedError('Service token missing valid subject.');
      }

      const iat = typeof payload.iat === 'number' ? payload.iat : 0;
      const exp = typeof payload.exp === 'number' ? payload.exp : 0;
      if (exp - iat > MAX_TOKEN_LIFETIME_SECONDS) {
        throw unauthorizedError('Token lifetime exceeds maximum allowable duration.');
      }

      const jti = typeof payload.jti === 'string' ? payload.jti : '';
      if (!jti || !toolReplayCache.checkAndStore(jti, exp)) {
        throw unauthorizedError('Service token replay detected.');
      }

      // User-scoped authorization: actor is tied strictly to the verified token subject
      req.actor = createActor({
        userId: payload.sub.trim(),
        sessionId: `svc-tool-${jti.slice(0, 8)}`,
        role: 'member',
      });

      next();
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw unauthorizedError();
    }
  };
}

export function createInternalToolsRoutes(
  basePath: string,
  controller: InternalToolsController,
  options: { serviceSecret: string; limiter?: RequestHandler },
): RouteGroup {
  const authMiddleware: RequestHandler[] = [
    ...(options.limiter ? [options.limiter] : []),
    createInternalServiceAuth(options.serviceSecret),
  ];

  return {
    basePath,
    routes: [
      // 1. Recent Workouts Tool
      defineRoute({
        method: 'post',
        path: '/recent-workouts',
        summary: 'Retrieve recent workouts and personal records for authenticated user',
        description: 'Internal machine-to-machine tool endpoint for Gemini AI Agent.',
        tags: ['Internal Tools'],
        access: { kind: 'public' },
        middleware: authMiddleware,
        request: { body: getRecentWorkoutsInputSchema },
        response: {
          status: 200,
          description: 'Recent workouts and PRs',
          message: 'Recent workouts retrieved successfully',
          schema: getRecentWorkoutsResponseSchema,
        },
        errorStatuses: [400, 401],
        handler: (req) => controller.getRecentWorkouts(req),
      }),

      // 2. Nutrition Summary Tool
      defineRoute({
        method: 'post',
        path: '/nutrition-summary',
        summary: 'Retrieve nutrition history and daily targets for authenticated user',
        description: 'Internal machine-to-machine tool endpoint for Gemini AI Agent.',
        tags: ['Internal Tools'],
        access: { kind: 'public' },
        middleware: authMiddleware,
        request: { body: getNutritionSummaryInputSchema },
        response: {
          status: 200,
          description: 'Daily nutrition logs and profile targets',
          message: 'Nutrition summary retrieved successfully',
          schema: getNutritionSummaryResponseSchema,
        },
        errorStatuses: [400, 401],
        handler: (req) => controller.getNutritionSummary(req),
      }),

      // 3. Weight Trend Tool
      defineRoute({
        method: 'post',
        path: '/weight-trend',
        summary: 'Retrieve weight log history and summary for authenticated user',
        description: 'Internal machine-to-machine tool endpoint for Gemini AI Agent.',
        tags: ['Internal Tools'],
        access: { kind: 'public' },
        middleware: authMiddleware,
        request: { body: getWeightTrendInputSchema },
        response: {
          status: 200,
          description: 'Weight logs and goal summary',
          message: 'Weight trend retrieved successfully',
          schema: getWeightTrendResponseSchema,
        },
        errorStatuses: [400, 401],
        handler: (req) => controller.getWeightTrend(req),
      }),

      // 4. Search Exercises Tool
      defineRoute({
        method: 'post',
        path: '/search-exercises',
        summary: 'Search verified exercise catalog',
        description: 'Internal machine-to-machine tool endpoint for Gemini AI Agent.',
        tags: ['Internal Tools'],
        access: { kind: 'public' },
        middleware: authMiddleware,
        request: { body: searchExercisesInputSchema },
        response: {
          status: 200,
          description: 'Matching exercises from catalog',
          message: 'Exercises retrieved successfully',
          schema: searchExercisesResponseSchema,
        },
        errorStatuses: [400, 401],
        handler: (req) => controller.searchExercises(req),
      }),

      // 5. Exercise Details Tool
      defineRoute({
        method: 'post',
        path: '/exercise-details',
        summary: 'Retrieve detailed exercise metadata and execution instructions',
        description: 'Internal machine-to-machine tool endpoint for Gemini / MCP AI Agent.',
        tags: ['Internal Tools'],
        access: { kind: 'public' },
        middleware: authMiddleware,
        request: { body: getExerciseDetailsInputSchema },
        response: {
          status: 200,
          description: 'Exercise details with instructions and mechanics',
          message: 'Exercise details retrieved successfully',
          schema: getExerciseDetailsResponseSchema,
        },
        errorStatuses: [400, 401],
        handler: (req) => controller.getExerciseDetails(req),
      }),

      // 6. Fitness Profile Tool
      defineRoute({
        method: 'post',
        path: '/fitness-profile',
        summary: 'Retrieve fitness profile summary for authenticated user',
        description: 'Internal machine-to-machine tool endpoint for Gemini / MCP AI Agent.',
        tags: ['Internal Tools'],
        access: { kind: 'public' },
        middleware: authMiddleware,
        request: { body: getFitnessProfileInputSchema },
        response: {
          status: 200,
          description: 'User fitness profile, equipment, and calculated targets',
          message: 'Fitness profile retrieved successfully',
          schema: getFitnessProfileResponseSchema,
        },
        errorStatuses: [400, 401],
        handler: (req) => controller.getFitnessProfile(req),
      }),

      // 7. Retrieve Fitness Knowledge Tool
      defineRoute({
        method: 'post',
        path: '/retrieve-knowledge',
        summary: 'Retrieve relevant fitness knowledge chunks from vector/text store',
        description: 'Internal machine-to-machine tool endpoint for Gemini / MCP AI Agent.',
        tags: ['Internal Tools'],
        access: { kind: 'public' },
        middleware: authMiddleware,
        request: { body: retrieveFitnessKnowledgeInputSchema },
        response: {
          status: 200,
          description: 'Relevant fitness knowledge chunks with similarity scores',
          message: 'Fitness knowledge retrieved successfully',
          schema: retrieveFitnessKnowledgeResponseSchema,
        },
        errorStatuses: [400, 401],
        handler: (req) => controller.retrieveFitnessKnowledge(req),
      }),
    ],
  };
}

