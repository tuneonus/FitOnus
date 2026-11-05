import { z } from 'zod';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../pagination/pagination.js';

export const idParamsSchema = z.object({ id: z.uuid('Must be a valid UUID') });

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
});

export const idempotencyHeadersSchema = z.object({
  'idempotency-key': z
    .string()
    .regex(/^[A-Za-z0-9_\-.:]{8,255}$/, 'Must be 8-255 characters of letters, digits, "_", "-", "." or ":"')
    .optional(),
});

export const paginationMetaSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export const errorEnvelopeSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    details: z.unknown().optional(),
  }),
});
