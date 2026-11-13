/**
 * Content of the password reset e-mail. Pure functions: no I/O, no clock, no secrets other than the
 * 6-digit OTP that is handed in (which is the whole point of the message).
 *
 * There is deliberately no link: the user types the OTP into the app.
 */

export const PASSWORD_RESET_SUBJECT = 'Your OnusFit password reset code';

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const minutesLabel = (minutes: number): string => (minutes === 1 ? '1 minute' : `${minutes} minutes`);

export interface PasswordResetEmailInput {
  /** The 6-digit one-time code. */
  otp: string;
  /** Whole minutes the code stays valid (at least 1). */
  validForMinutes: number;
}

export interface PasswordResetEmailContent {
  subject: string;
  text: string;
  html: string;
}

export function buildPasswordResetEmail({
  otp,
  validForMinutes,
}: PasswordResetEmailInput): PasswordResetEmailContent {
  const validity = minutesLabel(validForMinutes);

  const text = [
    'Your OnusFit password reset code is:',
    '',
    otp,
    '',
    'Enter this code in the OnusFit app, then choose a new password.',
    '',
    `The code works once and expires in ${validity}. Too many wrong attempts will cancel it.`,
    "If you didn't ask to reset your password, you can safely ignore this email: your password will not change.",
    'Never share this code with anyone. OnusFit will never ask you for it.',
  ].join('\n');

  const html = [
    '<!doctype html>',
    '<html lang="en"><body style="margin:0;padding:24px;background:#f4f5f7;">',
    '<div style="max-width:480px;margin:0 auto;padding:24px;background:#ffffff;border-radius:12px;',
    'font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827;line-height:1.5;">',
    '<h1 style="margin:0 0 16px;font-size:20px;">Reset your OnusFit password</h1>',
    '<p style="margin:0 0 12px;">Your verification code is:</p>',
    '<p style="margin:0 0 16px;padding:16px;background:#f3f4f6;border-radius:8px;text-align:center;',
    'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:34px;font-weight:700;',
    `letter-spacing:8px;user-select:all;">${escapeHtml(otp)}</p>`,
    '<p style="margin:0 0 12px;">Enter this code in the OnusFit app, then choose a new password.</p>',
    `<p style="margin:0 0 12px;">The code works once and expires in ${validity}. Too many wrong attempts will cancel it.</p>`,
    '<p style="margin:0;font-size:13px;color:#6b7280;">If you didn&#39;t ask to reset your password, you can safely ignore this email: your password will not change. Never share this code with anyone. OnusFit will never ask you for it.</p>',
    '</div></body></html>',
  ].join('');

  return { subject: PASSWORD_RESET_SUBJECT, text, html };
}
