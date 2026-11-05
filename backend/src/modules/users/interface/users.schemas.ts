import { z } from 'zod';
import { ROLES } from '../../../shared/auth/permissions.js';
import {
  idempotencyHeadersSchema,
  idParamsSchema,
  paginationQuerySchema,
} from '../../../shared/http/schemas.js';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../../shared/security/password-policy.js';
import { DISPLAY_NAME_MAX_LENGTH, USER_STATUSES } from '../domain/user.js';

const email = z.string().trim().max(254).pipe(z.email('Must be a valid email address'));
const displayName = z.string().trim().min(1).max(DISPLAY_NAME_MAX_LENGTH);

export const userViewSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  role: z.enum(ROLES),
  status: z.enum(USER_STATUSES),
  version: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  disabledAt: z.iso.datetime().nullable(),
});

export const userListSchema = z.array(userViewSchema);

// Strict bodies reject unknown fields, so clients cannot smuggle in e.g. "status" or "version".
export const createUserRequest = {
  headers: idempotencyHeadersSchema,
  body: z.strictObject({
    email,
    displayName,
    password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
    role: z.enum(ROLES).optional(),
  }),
};

export const listUsersRequest = {
  query: paginationQuerySchema.extend({
    search: z.string().trim().min(1).max(100).optional(),
    status: z.enum(USER_STATUSES).optional(),
    role: z.enum(ROLES).optional(),
    sort: z.enum(['createdAt', 'email', 'displayName']).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  }),
};

export const userIdRequest = { params: idParamsSchema };

const profileBody = z.strictObject({
  displayName,
  version: z.number().int().positive(),
});

export const updateOwnProfileRequest = { body: profileBody };

export const updateUserProfileRequest = { params: idParamsSchema, body: profileBody };
