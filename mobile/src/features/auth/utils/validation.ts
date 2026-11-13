/** Password-reset OTP: exactly six digits. Always a string: leading zeros are significant. */
export const OTP_LENGTH = 6;
export const sanitizeOtp = (value: string): string => value.replace(/\D/g, '').slice(0, OTP_LENGTH);
export const isValidOtp = (value: string): boolean => /^\d{6}$/.test(value);
/** Mirrors the server's 60 second resend cooldown (the server enforces it; this only drives the UI). */
export const RESEND_COOLDOWN_SECONDS = 60;

export const isValidEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

export function passwordStrength(password: string) {
  const checks = [
    { label: 'At least 12 characters', ok: password.length >= 12 },
    { label: 'One number', ok: /\d/.test(password) },
    { label: 'One uppercase letter', ok: /[A-Z]/.test(password) },
  ];

  const score = checks.filter((c) => c.ok).length;
  return {
    checks,
    score,
    label: ['Too weak', 'Weak', 'Good', 'Strong'][score],
  };
}

