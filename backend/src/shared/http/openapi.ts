import { z } from 'zod';
import { errorEnvelopeSchema, paginationMetaSchema } from './schemas.js';
import type { AnyRouteSpec, RouteGroup } from './route.js';

type JsonSchema = Record<string, unknown>;

const STATUS_TEXT: Record<number, string> = {
  400: 'Invalid request',
  401: 'Missing, invalid or revoked credentials',
  403: 'Not permitted',
  404: 'Not found',
  409: 'Conflict',
  413: 'Payload too large',
  422: 'Request understood but cannot be processed',
  429: 'Rate limited',
  500: 'Unexpected error',
  503: 'Service unavailable',
};

function toJsonSchema(schema: z.ZodType, io: 'input' | 'output'): JsonSchema {
  const json = z.toJSONSchema(schema, { io, unrepresentable: 'any' }) as JsonSchema;
  delete json.$schema;
  return json;
}

function parameters(schema: z.ZodType | undefined, location: 'path' | 'query' | 'header'): JsonSchema[] {
  if (!schema) return [];
  const json = toJsonSchema(schema, 'input');
  const properties = (json.properties ?? {}) as Record<string, JsonSchema>;
  const required = new Set((json.required ?? []) as string[]);
  return Object.entries(properties).map(([name, propertySchema]) => ({
    name,
    in: location,
    required: location === 'path' || required.has(name),
    schema: propertySchema,
  }));
}

const toOpenApiPath = (path: string): string => path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

const joinPath = (base: string, path: string): string => (path === '/' ? base : `${base}${path}`);

function successSchema(spec: AnyRouteSpec): JsonSchema {
  const properties: JsonSchema = {
    success: { type: 'boolean', const: true },
    data: toJsonSchema(spec.response.schema, 'output'),
    message: { type: 'string' },
  };
  if (spec.response.paginated) properties.meta = toJsonSchema(paginationMetaSchema, 'output');
  return { type: 'object', required: ['success', 'data', 'message'], properties };
}

function errorStatuses(spec: AnyRouteSpec): number[] {
  const statuses = new Set<number>(spec.errorStatuses ?? []);
  if (spec.request) statuses.add(400);
  if (spec.access.kind !== 'public') statuses.add(401);
  if (spec.access.kind === 'permission') statuses.add(403);
  statuses.add(500);
  return [...statuses].sort((a, b) => a - b);
}

function operation(spec: AnyRouteSpec, fullPath: string): JsonSchema {
  const responses: JsonSchema = {
    [spec.response.status]: {
      description: spec.response.description,
      content: { 'application/json': { schema: successSchema(spec) } },
    },
  };
  for (const status of errorStatuses(spec)) {
    responses[status] = {
      description: STATUS_TEXT[status] ?? 'Error',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
    };
  }

  const op: JsonSchema = {
    operationId: `${spec.method}_${fullPath.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')}`,
    summary: spec.summary,
    tags: spec.tags,
    parameters: [
      ...parameters(spec.request?.params, 'path'),
      ...parameters(spec.request?.query, 'query'),
      ...parameters(spec.request?.headers, 'header'),
    ],
    responses,
  };
  if (spec.description) op.description = spec.description;
  if (spec.request?.body) {
    op.requestBody = {
      required: true,
      content: { 'application/json': { schema: toJsonSchema(spec.request.body, 'input') } },
    };
  }
  if (spec.access.kind !== 'public') op.security = [{ bearerAuth: [] }];
  if (spec.access.kind === 'permission') op['x-required-permission'] = spec.access.permission;
  return op;
}

export function buildOpenApiDocument(
  groups: readonly RouteGroup[],
  info: { title: string; version: string; description?: string },
): JsonSchema {
  const paths: Record<string, Record<string, JsonSchema>> = {};
  for (const group of groups) {
    for (const spec of group.routes) {
      const fullPath = joinPath(group.basePath, spec.path);
      const key = toOpenApiPath(fullPath);
      paths[key] = { ...paths[key], [spec.method]: operation(spec, fullPath) };
    }
  }
  return {
    openapi: '3.1.0',
    info,
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: { ErrorEnvelope: toJsonSchema(errorEnvelopeSchema, 'output') },
    },
  };
}
