import express, { Router, type Request, type RequestHandler, type Response } from 'express';
import type { z } from 'zod';
import { requirePermission } from '../../middleware/authorize.js';
import { bindRequestCorrelation } from '../../middleware/request-context.js';
import { validate, type RequestSchemas } from '../../middleware/validate.js';
import type { Permission } from '../auth/permissions.js';
import { AppError } from '../errors/app-error.js';
import type { PaginationMeta } from '../pagination/pagination.js';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * Every route must declare its access level explicitly (deny by default):
 * - public: no token
 * - authenticated: any valid session; ownership is enforced inside the use case
 * - permission: token plus the named permission, checked before validation
 */
export type RouteAccess =
  { kind: 'public' } | { kind: 'authenticated' } | { kind: 'permission'; permission: Permission };

export interface RouteResult<T> {
  data: T;
  message?: string;
  meta?: PaginationMeta;
  status?: number;
  headers?: Record<string, string>;
}

export interface RouteSpec<T> {
  method: HttpMethod;
  /** Express path relative to the group's base path, e.g. "/:id". */
  path: string;
  summary: string;
  description?: string;
  tags: readonly string[];
  access: RouteAccess;
  request?: RequestSchemas;
  /** Runs before authentication (e.g. rate limiters). */
  middleware?: readonly RequestHandler[];
  /**
   * A larger JSON body limit for this route only (e.g. "11mb" for a route that carries a base64 photo or audio clip).
   *
   * The body is read AFTER authentication and the permission check, so a caller who is not allowed to use the route
   * never makes the server buffer a large body; the application-wide JSON parser (small limit, see `BODY_LIMIT`)
   * skips exactly the routes that declare this, which `largeBodyRouteKeys` collects from these same specs. Every other
   * route keeps the small limit, so this is the only place a bigger limit is granted.
   */
  bodyLimit?: string;
  /** When true, handler streams directly (e.g. text/event-stream) after setting headers and flushes. */
  streaming?: boolean;
  response: {
    status: number;
    description: string;
    message: string;
    /** Output is parsed through this schema, so undeclared fields can never leak. */
    schema: z.ZodType<T>;
    paginated?: boolean;
  };
  /** Extra error statuses to document (400/401/403/500 are derived automatically). */
  errorStatuses?: readonly number[];
  handler: (req: Request, res: Response) => Promise<RouteResult<T>>;
}

export type AnyRouteSpec = RouteSpec<unknown>;

/** Infers `T` from the response schema so the handler's return type is checked against it. */
export const defineRoute = <T>(spec: RouteSpec<T>): AnyRouteSpec => spec;

export interface RouteGroup {
  /** Full mount path, e.g. "/api/v1/users". */
  basePath: string;
  routes: readonly AnyRouteSpec[];
}

/**
 * The identity of a request for body-limit purposes: method and path, with the case and trailing slashes Express
 * ignores when it matches routes ignored here too, so a request cannot reach a route by a spelling this does not know.
 */
export const requestRouteKey = (method: string, path: string): string =>
  `${method.toUpperCase()} ${path.toLowerCase().replace(/\/+$/, '')}`;

/**
 * The routes that declare their own `bodyLimit`, as `requestRouteKey`s. The application-wide JSON parser skips these
 * (their own parser runs after authentication instead). Derived from the specs, never listed by hand, and only
 * parameter-free paths can match (a route with `:id` and a big body is not supported).
 */
export function largeBodyRouteKeys(groups: readonly RouteGroup[]): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const group of groups) {
    for (const spec of group.routes) {
      if (!spec.bodyLimit) continue;
      if (spec.path.includes(':') || spec.path.includes('*')) {
        throw new Error(`Route ${group.basePath}${spec.path}: bodyLimit needs a path without parameters`);
      }
      keys.add(requestRouteKey(spec.method, `${group.basePath}${spec.path === '/' ? '' : spec.path}`));
    }
  }
  return keys;
}

function respond(spec: AnyRouteSpec): RequestHandler {
  return async (req, res) => {
    const result = await spec.handler(req, res);
    if (spec.streaming && (res.headersSent || res.writableEnded)) {
      return;
    }
    const data = spec.response.schema.parse(result.data);
    for (const [name, value] of Object.entries(result.headers ?? {})) res.setHeader(name, value);
    res.status(result.status ?? spec.response.status).json({
      success: true,
      data,
      message: result.message ?? spec.response.message,
      ...(result.meta ? { meta: result.meta } : {}),
    });
  };
}

/**
 * Builds an Express router from route specs. The same specs feed the OpenAPI document,
 * so documented access rules are exactly the enforced ones.
 */
export function buildRouter(routes: readonly AnyRouteSpec[], deps: { authenticate: RequestHandler }): Router {
  const router = Router();
  const methodsByPath = new Map<string, Set<string>>();

  for (const spec of routes) {
    const chain: RequestHandler[] = [...(spec.middleware ?? [])];
    if (spec.access.kind !== 'public') chain.push(deps.authenticate);
    if (spec.access.kind === 'permission') chain.push(requirePermission(spec.access.permission));
    if (spec.bodyLimit) {
      chain.push(express.json({ limit: spec.bodyLimit, strict: true }));
      // Body parsers resume the request from stream callbacks, which can drop the async context that carries the
      // correlation id (see bindRequestCorrelation), so it is bound again after this parser.
      chain.push(bindRequestCorrelation);
    }
    if (spec.request) chain.push(validate(spec.request));
    chain.push(respond(spec));
    router[spec.method](spec.path, ...chain);

    const methods = methodsByPath.get(spec.path) ?? new Set<string>();
    methods.add(spec.method.toUpperCase());
    if (spec.method === 'get') methods.add('HEAD');
    methodsByPath.set(spec.path, methods);
  }

  for (const [path, methods] of methodsByPath) {
    router.all(path, (_req, res) => {
      res.setHeader('Allow', [...methods].join(', '));
      throw new AppError(
        'method_not_allowed',
        'METHOD_NOT_ALLOWED',
        'This method is not allowed for this route.',
      );
    });
  }
  return router;
}
