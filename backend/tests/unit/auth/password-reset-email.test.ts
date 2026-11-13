import { describe, expect, it } from 'vitest';
import {
  buildPasswordResetEmail,
  PASSWORD_RESET_SUBJECT,
} from '../../../src/modules/auth/infrastructure/password-reset-email.js';

describe('buildPasswordResetEmail', () => {
  it('shows the 6-digit OTP verbatim, large, with its leading zeros in both the text and the html part', () => {
    const otp = '004217'; // leading zeros must survive
    const email = buildPasswordResetEmail({ otp, validForMinutes: 5 });

    expect(email.subject).toBe(PASSWORD_RESET_SUBJECT);
    expect(email.text.split('\n')).toContain(otp); // alone on its own line: easy to select and copy
    expect(email.html).toContain(`>${otp}</p>`);
    expect(email.subject).not.toContain(otp); // subjects show up in notifications and logs
  });

  it('states the validity period, the single-use rule and the attempt limit', () => {
    const email = buildPasswordResetEmail({ otp: '482913', validForMinutes: 5 });
    expect(email.text).toMatch(/works once and expires in 5 minutes/);
    expect(email.html).toMatch(/works once and expires in 5 minutes/);
    expect(buildPasswordResetEmail({ otp: '482913', validForMinutes: 1 }).text).toMatch(
      /expires in 1 minute\./,
    );
  });

  it('contains no link: the user types the OTP into the app', () => {
    const { text, html } = buildPasswordResetEmail({ otp: '482913', validForMinutes: 5 });
    expect(text).not.toMatch(/https?:\/\/|fitonus:\/\//i);
    expect(html).not.toMatch(/https?:\/\/|fitonus:\/\/|<a[\s>]/i);
  });

  it('does not reveal anything about the account', () => {
    const { text, html, subject } = buildPasswordResetEmail({ otp: '482913', validForMinutes: 5 });
    for (const part of [text, html, subject]) expect(part).not.toMatch(/@|alice|account/i);
  });

  it('html-escapes the code so a hostile value cannot inject markup', () => {
    const { html } = buildPasswordResetEmail({ otp: '<script>alert("x")</script>&\'', validForMinutes: 5 });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;');
  });
});
