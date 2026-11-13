import { z } from 'zod';
import { idParamsSchema } from '../../../shared/http/schemas.js';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../../shared/security/password-policy.js';

const email = z.string().trim().max(254).pipe(z.email('Must be a valid email address'));
const newPassword = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);
// Existing passwords are not re-checked against the current policy; length is capped to bound hashing cost.
const existingPassword = z.string().min(1).max(1_024);

export const registerRequest = {
  body: z.strictObject({ email, displayName: z.string().trim().min(1).max(100), password: newPassword }),
};

export const loginRequest = { body: z.strictObject({ email, password: existingPassword }) };

export const refreshRequest = { body: z.strictObject({ refreshToken: z.string().min(1).max(512) }) };

export const changePasswordRequest = {
  body: z.strictObject({ currentPassword: existingPassword, newPassword }),
};

export const forgotPasswordRequest = {
  body: z.strictObject({ email }),
};

export const resetPasswordRequest = {
  body: z.strictObject({
    email,
    // Exactly six digits; leading zeros matter, so it is a string, never a number.
    otp: z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'The code must be exactly 6 digits'),
    newPassword,
  }),
};

export const messageResponseSchema = z.object({
  message: z.string(),
});

export const sessionIdRequest = { params: idParamsSchema };

export const tokensSchema = z.object({
  tokenType: z.literal('Bearer'),
  accessToken: z.string(),
  accessTokenExpiresAt: z.iso.datetime(),
  refreshToken: z.string(),
  refreshTokenExpiresAt: z.iso.datetime(),
});

export const sessionSchema = z.object({
  id: z.uuid(),
  current: z.boolean(),
  createdAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
});

export const sessionListSchema = z.array(sessionSchema);

export const revocationSchema = z.object({ revokedSessions: z.number().int() });
