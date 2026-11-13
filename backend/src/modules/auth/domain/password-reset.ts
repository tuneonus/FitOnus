/** Tunables of the password reset flow. Every value is overridable through `createAuthModule`. */
export interface PasswordResetSettings {
  /** How long an e-mailed OTP stays valid. Short on purpose: 6 digits are only safe with a tight window. */
  tokenTtlMinutes: number;
  /** Failed verifications allowed per OTP; the OTP is dead after this many wrong guesses. */
  maxVerificationAttempts: number;
  /** Minimum gap between two OTPs for one account (resend cooldown). Requests inside it are swallowed silently. */
  resendCooldownSeconds: number;
  /** Per-user mail-bomb throttle: at most this many tokens are issued inside `requestWindowMinutes`. */
  maxRequestsPerWindow: number;
  requestWindowMinutes: number;
  /**
   * Floor for the duration of POST /forgot-password. Hides the (small) difference between "account
   * found, token stored" and "nothing to do" so response timing does not reveal which e-mails exist.
   */
  minResponseMs: number;
}

export const DEFAULT_PASSWORD_RESET_SETTINGS: Readonly<PasswordResetSettings> = {
  tokenTtlMinutes: 5,
  maxVerificationAttempts: 5,
  resendCooldownSeconds: 60,
  maxRequestsPerWindow: 3,
  requestWindowMinutes: 60,
  minResponseMs: 250,
};

const isIntegerBetween = (value: number, min: number, max: number): boolean =>
  Number.isInteger(value) && value >= min && value <= max;

/** Fails fast at composition time instead of silently issuing eternal or unusable codes. */
export function resolvePasswordResetSettings(
  overrides: Partial<PasswordResetSettings> = {},
): PasswordResetSettings {
  const defaults = DEFAULT_PASSWORD_RESET_SETTINGS;
  const settings: PasswordResetSettings = {
    tokenTtlMinutes: overrides.tokenTtlMinutes ?? defaults.tokenTtlMinutes,
    maxVerificationAttempts: overrides.maxVerificationAttempts ?? defaults.maxVerificationAttempts,
    resendCooldownSeconds: overrides.resendCooldownSeconds ?? defaults.resendCooldownSeconds,
    maxRequestsPerWindow: overrides.maxRequestsPerWindow ?? defaults.maxRequestsPerWindow,
    requestWindowMinutes: overrides.requestWindowMinutes ?? defaults.requestWindowMinutes,
    minResponseMs: overrides.minResponseMs ?? defaults.minResponseMs,
  };

  const problems: string[] = [];
  if (!isIntegerBetween(settings.tokenTtlMinutes, 1, 24 * 60)) {
    problems.push('tokenTtlMinutes must be an integer between 1 and 1440');
  }
  if (!isIntegerBetween(settings.maxVerificationAttempts, 1, 20)) {
    problems.push('maxVerificationAttempts must be an integer between 1 and 20');
  }
  if (!isIntegerBetween(settings.resendCooldownSeconds, 0, 3_600)) {
    problems.push('resendCooldownSeconds must be an integer between 0 and 3600');
  }
  if (!isIntegerBetween(settings.maxRequestsPerWindow, 1, 100)) {
    problems.push('maxRequestsPerWindow must be an integer between 1 and 100');
  }
  if (!isIntegerBetween(settings.requestWindowMinutes, 1, 24 * 60)) {
    problems.push('requestWindowMinutes must be an integer between 1 and 1440');
  }
  if (!isIntegerBetween(settings.minResponseMs, 0, 5_000)) {
    problems.push('minResponseMs must be an integer between 0 and 5000');
  }
  if (problems.length > 0) throw new Error(`Invalid password reset settings: ${problems.join('; ')}`);
  return settings;
}

const MINUTE_MS = 60_000;

export const resetExpiry = (now: Date, ttlMinutes: number): Date =>
  new Date(now.getTime() + ttlMinutes * MINUTE_MS);

export const minutesBefore = (now: Date, minutes: number): Date =>
  new Date(now.getTime() - minutes * MINUTE_MS);

/** The OTP is exactly six decimal digits (leading zeros are significant). */
const RESET_OTP = /^\d{6}$/;

export const isWellFormedOtp = (otp: string): boolean => RESET_OTP.test(otp);

/**
 * What gets keyed-hashed for an OTP. The random row id makes each digest unique and row-bound even though
 * 6-digit codes repeat; the prefix separates it from other uses of the same keyed hasher.
 */
export const otpDigestInput = (rowId: string, otp: string): string => `password-reset-otp:${rowId}:${otp}`;

/** A stored reset OTP. The OTP itself is never persisted, only its keyed digest. */
export interface PasswordResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
  failedAttempts: number;
}

/** Redeemable iff never used/superseded, strictly before expiry, and not locked out by wrong guesses. */
export const isRedeemable = (token: PasswordResetToken, now: Date, maxAttempts: number): boolean =>
  token.usedAt === null && token.expiresAt.getTime() > now.getTime() && token.failedAttempts < maxAttempts;
