import type { Request, RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '../shared/errors/app-error.js';

export interface RequestSchemas {
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  headers?: z.ZodType;
}

type Output<S> = S extends z.ZodType ? z.output<S> : undefined;

export interface Validated<S extends RequestSchemas> {
  params: Output<S['params']>;
  query: Output<S['query']>;
  body: Output<S['body']>;
  headers: Output<S['headers']>;
}

export interface ValidationIssue {
  location: keyof RequestSchemas;
  path: string;
  message: string;
}

const LOCATIONS = ['params', 'query', 'headers', 'body'] as const;

/** Parses each request part with its schema. Unknown keys are stripped (or rejected by strict schemas). */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req, _res, next) => {
    const validated: Record<string, unknown> = {};
    const issues: ValidationIssue[] = [];

    for (const location of LOCATIONS) {
      const schema = schemas[location];
      if (!schema) continue;
      const result = schema.safeParse(req[location]);
      if (result.success) {
        validated[location] = result.data;
      } else {
        issues.push(
          ...result.error.issues.map((issue) => ({
            location,
            path: issue.path.map(String).join('.'),
            message: issue.message,
          })),
        );
      }
    }

    if (issues.length > 0) {
      throw new AppError('validation', 'VALIDATION_FAILED', 'The request is invalid.', issues);
    }
    req.validated = validated;
    next();
  };
}

/** Typed access to the output of `validate(schemas)` for the same schemas object. */
export function getValidated<S extends RequestSchemas>(req: Request, _schemas: S): Validated<S> {
  if (!req.validated) throw new Error('validate() middleware has not run for this route');
  return req.validated as unknown as Validated<S>;
}
