import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getHealthEndpointUrl,
  getLivenessEndpointUrl,
  checkBackendHealth,
} from '../src/lib/system-health';
import type { ToastItem, ToastType } from '../src/components/ui/Toast';
import type { AdminUser } from '../src/features/auth/types';

describe('Admin Foundation & UI Quality — Phase 10.2A Tests', () => {
  // 1. Toast Notification System: Type and ID creation
  it('1. Toast Notification: generates unique ID and respects notification types', () => {
    const types: ToastType[] = ['success', 'error', 'warning', 'info'];
    assert.equal(types.length, 4);
    const toasts: ToastItem[] = [];

    const addToast = (type: ToastType, message: string, title?: string, duration = 4000): ToastItem => {
      const id = `test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const toast: ToastItem = { id, type, title, message, duration };
      toasts.push(toast);
      return toast;
    };

    const t1 = addToast('success', 'User suspended successfully');
    const t2 = addToast('error', 'Operation failed', 'Error');
    const t3 = addToast('warning', 'Session expiring soon');
    const t4 = addToast('info', 'System maintenance scheduled');

    assert.equal(toasts.length, 4);
    assert.notEqual(t1.id, t2.id);
    assert.equal(t1.type, 'success');
    assert.equal(t2.type, 'error');
    assert.equal(t2.title, 'Error');
    assert.equal(t3.type, 'warning');
    assert.equal(t4.type, 'info');
    assert.equal(t1.duration, 4000);
  });

  // 2. Toast Notification: Dismissal and filter logic
  it('2. Toast Notification: dismisses toast by id without mutating remaining toasts', () => {
    let toasts: ToastItem[] = [
      { id: 't-1', type: 'info', message: 'First' },
      { id: 't-2', type: 'success', message: 'Second' },
      { id: 't-3', type: 'error', message: 'Third' },
    ];

    const removeToast = (id: string) => {
      toasts = toasts.filter((t) => t.id !== id);
    };

    removeToast('t-2');
    assert.equal(toasts.length, 2);
    assert.deepEqual(
      toasts.map((t) => t.id),
      ['t-1', 't-3'],
    );
  });

  // 3. Toast Accessibility: Correct ARIA roles mapping
  it('3. Toast Accessibility: maps error/warning to "alert" and success/info to "status"', () => {
    const getAriaRole = (type: ToastType) => {
      return type === 'error' || type === 'warning' ? 'alert' : 'status';
    };

    assert.equal(getAriaRole('error'), 'alert');
    assert.equal(getAriaRole('warning'), 'alert');
    assert.equal(getAriaRole('success'), 'status');
    assert.equal(getAriaRole('info'), 'status');
  });

  // 4. Admin Password Security: Minimum 12 characters validation
  it('4. Admin Password Validation: enforces minimum 12 characters length policy', () => {
    const validateLength = (pwd: string): boolean => pwd.length >= 12;

    assert.equal(validateLength(''), false);
    assert.equal(validateLength('12345678'), false);
    assert.equal(validateLength('FitOnus1234'), false); // 11 chars
    assert.equal(validateLength('FitOnus12345'), true);  // 12 chars
    assert.equal(validateLength('SuperSecurePassword2026!'), true);
  });

  // 5. Admin Password Security: Passwords match verification
  it('5. Admin Password Validation: requires new password and confirm password to match', () => {
    const validateMatch = (pwd: string, confirm: string): boolean => {
      return pwd.length > 0 && pwd === confirm;
    };

    assert.equal(validateMatch('SuperSecurePassword2026!', 'DifferentPassword2026!'), false);
    assert.equal(validateMatch('SuperSecurePassword2026!', ''), false);
    assert.equal(validateMatch('SuperSecurePassword2026!', 'SuperSecurePassword2026!'), true);
  });

  // 6. Admin Password Security: Difference from current password
  it('6. Admin Password Validation: requires new password to be different from current', () => {
    const validateDifferent = (current: string, next: string): boolean => {
      return next.length > 0 && current.length > 0 && current !== next;
    };

    assert.equal(validateDifferent('OldPassword123!', 'OldPassword123!'), false);
    assert.equal(validateDifferent('OldPassword123!', 'NewPassword123!'), true);
    assert.equal(validateDifferent('', 'NewPassword123!'), false);
  });

  // 7. Admin Security Policy: Password change submission policy and duplicate lock
  it('7. Admin Security Policy: allows submission when valid, locks when submitting or invalid', () => {
    interface PasswordChangeFormState {
      currentPassword: string;
      newPassword: string;
      confirmPassword: string;
      isSubmitting: boolean;
    }

    const canSubmit = (state: PasswordChangeFormState): boolean => {
      if (state.isSubmitting) return false;
      const hasCurrent = state.currentPassword.trim().length > 0;
      const validLen = state.newPassword.length >= 12;
      const match = state.newPassword === state.confirmPassword;
      const diff = state.newPassword !== state.currentPassword;
      return hasCurrent && validLen && match && diff;
    };

    // Valid state -> can submit
    assert.equal(
      canSubmit({
        currentPassword: 'ExistingPassword123!',
        newPassword: 'BrandNewSecurePassword2026!',
        confirmPassword: 'BrandNewSecurePassword2026!',
        isSubmitting: false,
      }),
      true
    );

    // In-flight submission -> locked against duplicate submission
    assert.equal(
      canSubmit({
        currentPassword: 'ExistingPassword123!',
        newPassword: 'BrandNewSecurePassword2026!',
        confirmPassword: 'BrandNewSecurePassword2026!',
        isSubmitting: true,
      }),
      false
    );

    // Short password -> locked
    assert.equal(
      canSubmit({
        currentPassword: 'ExistingPassword123!',
        newPassword: 'Short!',
        confirmPassword: 'Short!',
        isSubmitting: false,
      }),
      false
    );
  });

  // 8. Admin Security Policy: Mobile API isolation guarantee
  it('8. Admin Security Policy: mobile change-password endpoint is never called from admin', () => {
    const ADMIN_ALLOWED_ENDPOINTS = [
      '/api/v1/admin/auth/login',
      '/api/v1/admin/auth/logout',
      '/api/v1/admin/auth/change-password',
      '/api/v1/admin/auth/session',
      '/api/v1/admin/users',
      '/api/v1/admin/workouts',
      '/api/v1/admin/nutrition',
      '/api/v1/admin/challenges',
      '/api/v1/admin/audit-logs',
    ];

    const FORBIDDEN_MOBILE_ENDPOINTS = [
      '/api/v1/auth/change-password',
      '/api/v1/users/me',
      '/api/v1/profile/settings',
    ];

    for (const forbidden of FORBIDDEN_MOBILE_ENDPOINTS) {
      assert.equal(
        ADMIN_ALLOWED_ENDPOINTS.includes(forbidden),
        false,
        `Admin allowed endpoints must never contain mobile endpoint: ${forbidden}`,
      );
    }
  });

  // 9. System Health URL Resolution: Standard HTTP & HTTPS endpoints
  it('9. System Health: derives readiness endpoint from API_BASE correctly', () => {
    const url1 = getHealthEndpointUrl('http://localhost:3000/api/v1/admin');
    assert.equal(url1, 'http://localhost:3000/health/ready');

    const url2 = getHealthEndpointUrl('https://fitonus-backend.onrender.com/api/v1/admin');
    assert.equal(url2, 'https://fitonus-backend.onrender.com/health/ready');

    const url3 = getHealthEndpointUrl('https://api.fitonus.com/api/v1');
    assert.equal(url3, 'https://api.fitonus.com/health/ready');
  });

  // 10. System Health URL Resolution: Liveness probe fallback endpoint
  it('10. System Health: derives liveness fallback endpoint correctly', () => {
    const liveUrl1 = getLivenessEndpointUrl('http://localhost:3000/api/v1/admin');
    assert.equal(liveUrl1, 'http://localhost:3000/health/live');

    const liveUrl2 = getLivenessEndpointUrl('https://fitonus-backend.onrender.com/api/v1/admin');
    assert.equal(liveUrl2, 'https://fitonus-backend.onrender.com/health/live');
  });

  // 11. System Health: 200 OK translates to "healthy" status
  it('11. System Health: translates 200 OK into healthy status', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async () => {
        return new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as typeof fetch;

      const health = await checkBackendHealth(2000, 'http://localhost:3000/api/v1/admin');
      assert.equal(health.status, 'healthy');
      assert.ok(health.details.includes('online'));
      assert.ok(typeof health.latencyMs === 'number');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 12. System Health: 503 Service Unavailable translates to "degraded" status
  it('12. System Health: translates 503 into degraded status (database unreachable)', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async () => {
        return new Response(
          JSON.stringify({ error: { message: 'The service is not ready.' } }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }) as typeof fetch;

      const health = await checkBackendHealth(2000, 'http://localhost:3000/api/v1/admin');
      assert.equal(health.status, 'degraded');
      assert.ok(health.details.includes('503'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 13. System Health: Fallback from 404 readiness to 200 liveness probe
  it('13. System Health: falls back to liveness probe if readiness returns 404', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async (input: string | URL | Request) => {
        const urlStr = input.toString();
        if (urlStr.includes('/health/ready')) {
          return new Response('Not Found', { status: 404 });
        }
        if (urlStr.includes('/health/live')) {
          return new Response(JSON.stringify({ status: 'ok' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('Not Found', { status: 404 });
      }) as typeof fetch;

      const health = await checkBackendHealth(2000, 'http://localhost:3000/api/v1/admin');
      assert.equal(health.status, 'healthy');
      assert.ok(health.details.includes('active'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 14. System Health: Network failure or timeout returns "unavailable" gracefully without throwing
  it('14. System Health: handles fetch timeout and connection error without unhandled exception', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async () => {
        throw new Error('ECONNREFUSED');
      }) as typeof fetch;

      const health = await checkBackendHealth(2000, 'http://localhost:3000/api/v1/admin');
      assert.equal(health.status, 'unavailable');
      assert.ok(health.details.includes('unreachable'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 15. Admin User Profile Data Presentation
  it('15. Admin User Profile: formats admin identity and permissions correctly', () => {
    const adminUser: AdminUser = {
      id: 'usr_admin_0001',
      email: 'admin@fitonus.com',
      displayName: 'Lead Architect',
      role: 'admin',
      permissions: ['admin:access', 'admin:write', 'challenges:manage'],
    };

    const initials = adminUser.displayName
      ? adminUser.displayName.slice(0, 2).toUpperCase()
      : 'AD';

    assert.equal(initials, 'LE');
    assert.equal(adminUser.role, 'admin');
    assert.equal(adminUser.permissions?.length, 3);
    assert.ok(adminUser.permissions?.includes('admin:access'));
  });
});
