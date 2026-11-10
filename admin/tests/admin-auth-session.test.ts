/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getAuthToken, setAuthToken, clearAuthToken } from '../src/lib/token-storage';
import { apiClient, ApiError } from '../src/lib/api-client';
import { authApi } from '../src/features/auth/api';
import type { AdminUser, AdminLoginResult } from '../src/features/auth/types';

// Mock localStorage in Node.js test environment
const mockStorage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string): string | null => mockStorage[key] ?? null,
  setItem: (key: string, value: string): void => {
    mockStorage[key] = String(value);
  },
  removeItem: (key: string): void => {
    delete mockStorage[key];
  },
  clear: (): void => {
    for (const key of Object.keys(mockStorage)) {
      delete mockStorage[key];
    }
  },
};

// Polyfill window & localStorage for tests
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    location: { pathname: '/' },
    dispatchEvent: (_event: any) => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}
(globalThis as any).localStorage = mockLocalStorage;
(globalThis.window as any).localStorage = mockLocalStorage;

describe('Admin Authentication Session Persistence & Redirect Verification (Step 5)', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    (globalThis.window as any).location.pathname = '/';
  });

  // 1. Successful login persists authenticated state
  it('1. Successful login persists authenticated state: token is saved to storage and retrievable', async () => {
    const originalFetch = globalThis.fetch;
    const testToken = 'fitonus_test_jwt_access_token_123';
    const mockUser: AdminUser = {
      id: 'ae1c758b-e47d-4053-ab70-4114c2bfab79',
      email: 'admin@fitonus.com',
      displayName: 'FitOnus Administrator',
      role: 'admin',
      permissions: ['*'],
    };

    globalThis.fetch = async (url: any, init?: any) => {
      assert.match(String(url), /\/auth\/login$/);
      assert.equal(init?.method, 'POST');
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: {
            tokenType: 'Bearer',
            accessToken: testToken,
            accessTokenExpiresAt: new Date(Date.now() + 900000).toISOString(),
            refreshToken: 'refresh_tok_abc',
            refreshTokenExpiresAt: new Date(Date.now() + 604800000).toISOString(),
            user: mockUser,
          },
        }),
      } as any;
    };

    try {
      const result: AdminLoginResult = await authApi.login({
        email: 'admin@fitonus.com',
        password: 'ValidPassword123!',
      });

      assert.equal(result.user.email, 'admin@fitonus.com');
      assert.equal(result.accessToken, testToken);
      // Verify token persisted in storage
      assert.equal(getAuthToken(), testToken);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 2. Dashboard stays open after login
  it('2. Dashboard stays open after login: subsequent requests send Authorization Bearer header', async () => {
    const originalFetch = globalThis.fetch;
    const testToken = 'fitonus_test_jwt_access_token_456';
    setAuthToken(testToken);

    let sentAuthHeader: string | null = null;
    let sentCredentials: any = null;

    globalThis.fetch = async (url: any, init?: any) => {
      const headers = init?.headers as Headers;
      sentAuthHeader = headers.get('Authorization');
      sentCredentials = init?.credentials;

      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: { totalUsers: 100, activeUsers7d: 85 },
        }),
      } as any;
    };

    try {
      const res = await apiClient<any>('/dashboard/stats');
      assert.equal(res.data.totalUsers, 100);
      assert.equal(sentAuthHeader, `Bearer ${testToken}`);
      assert.equal(sentCredentials, 'include');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 3. Page refresh retains valid session
  it('3. Page refresh retains valid session: stored token is available during hydration', () => {
    const testToken = 'fitonus_persisted_session_token_789';
    setAuthToken(testToken);

    // Simulate page reload: token-storage retrieves token on reload
    const retrievedToken = getAuthToken();
    assert.equal(retrievedToken, testToken);

    // Hydration check: having a token prevents premature logout
    const hasActiveSession = Boolean(retrievedToken);
    assert.equal(hasActiveSession, true);
  });

  // 4. Auth/me verification succeeds
  it('4. Auth/me verification succeeds: returns authenticated admin profile using stored bearer token', async () => {
    const originalFetch = globalThis.fetch;
    const testToken = 'fitonus_verified_token_101';
    setAuthToken(testToken);

    const mockAdmin: AdminUser = {
      id: 'ae1c758b-e47d-4053-ab70-4114c2bfab79',
      email: 'admin@fitonus.com',
      displayName: 'System Admin',
      role: 'admin',
      permissions: ['users:read', 'users:write', 'settings:all'],
    };

    let checkedAuthHeader: string | null = null;

    globalThis.fetch = async (url: any, init?: any) => {
      assert.match(String(url), /\/auth\/me$/);
      const headers = init?.headers as Headers;
      checkedAuthHeader = headers.get('Authorization');
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: mockAdmin,
        }),
      } as any;
    };

    try {
      const me = await authApi.getMe();
      assert.equal(me.id, mockAdmin.id);
      assert.equal(me.email, 'admin@fitonus.com');
      assert.equal(me.role, 'admin');
      assert.equal(checkedAuthHeader, `Bearer ${testToken}`);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 5. Expired/invalid sessions redirect correctly
  it('5. Expired/invalid sessions redirect correctly: 401 dispatches session expired event and clears token', async () => {
    const originalFetch = globalThis.fetch;
    let eventDispatched = false;
    let dispatchedMessage = '';

    const originalDispatch = (globalThis.window as any).dispatchEvent;
    (globalThis.window as any).dispatchEvent = (event: any) => {
      if (event?.type === 'fitonus:auth:expired') {
        eventDispatched = true;
        dispatchedMessage = event.detail?.message;
        clearAuthToken();
      }
      return true;
    };

    setAuthToken('expired_or_revoked_token');
    (globalThis.window as any).location.pathname = '/dashboard';

    globalThis.fetch = async () => {
      return {
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          error: { message: 'Session expired or revoked.', code: 'UNAUTHORIZED' },
        }),
      } as any;
    };

    try {
      await assert.rejects(
        async () => {
          await apiClient('/dashboard/stats');
        },
        (err: any) => {
          assert.equal(err instanceof ApiError, true);
          assert.equal(err.status, 401);
          return true;
        },
      );

      assert.equal(eventDispatched, true);
      assert.equal(dispatchedMessage, 'Session expired or revoked.');
      // Token must have been cleared
      assert.equal(getAuthToken(), null);
    } finally {
      globalThis.fetch = originalFetch;
      (globalThis.window as any).dispatchEvent = originalDispatch;
    }
  });

  // 6. Logout clears session
  it('6. Logout clears session: removes bearer token and issues logout API request', async () => {
    const originalFetch = globalThis.fetch;
    setAuthToken('token_to_be_cleared');
    let logoutCalled = false;

    globalThis.fetch = async (url: any, init?: any) => {
      if (String(url).endsWith('/auth/logout')) {
        logoutCalled = true;
        assert.equal(init?.method, 'POST');
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, data: { message: 'Logged out successfully' } }),
        } as any;
      }
      throw new Error('Unexpected URL');
    };

    try {
      assert.notEqual(getAuthToken(), null);
      await authApi.logout();
      assert.equal(logoutCalled, true);
      assert.equal(getAuthToken(), null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 7. Non-admin users remain blocked
  it('7. Non-admin users remain blocked: 403 Forbidden is raised and access rejected', async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () => {
      return {
        ok: false,
        status: 403,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          error: { message: 'Forbidden: administrative privileges required', code: 'FORBIDDEN' },
        }),
      } as any;
    };

    try {
      await assert.rejects(
        async () => {
          await apiClient('/users');
        },
        (err: any) => {
          assert.equal(err instanceof ApiError, true);
          assert.equal(err.status, 403);
          assert.equal(err.code, 'FORBIDDEN');
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 8. No infinite login redirect loop
  it('8. No infinite login redirect loop: 401 on /login does NOT dispatch fitonus:auth:expired', async () => {
    const originalFetch = globalThis.fetch;
    let eventDispatched = false;

    const originalDispatch = (globalThis.window as any).dispatchEvent;
    (globalThis.window as any).dispatchEvent = (event: any) => {
      if (event?.type === 'fitonus:auth:expired') {
        eventDispatched = true;
      }
      return true;
    };

    // User is on the login page submitting bad credentials
    (globalThis.window as any).location.pathname = '/login';

    globalThis.fetch = async () => {
      return {
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          error: { message: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' },
        }),
      } as any;
    };

    try {
      await assert.rejects(
        async () => {
          await apiClient('/auth/login', { method: 'POST', body: '{}' });
        },
        (err: any) => {
          assert.equal(err instanceof ApiError, true);
          assert.equal(err.status, 401);
          return true;
        },
      );

      // Verify that expired event was NOT dispatched from /login
      assert.equal(eventDispatched, false);
    } finally {
      globalThis.fetch = originalFetch;
      (globalThis.window as any).dispatchEvent = originalDispatch;
    }
  });

  // 9. Existing CORS behavior remains intact
  it('9. Existing CORS behavior remains intact: request includes custom X-Panel-Id and credentials include', async () => {
    const originalFetch = globalThis.fetch;
    let capturedHeaders: Headers | null = null;
    let capturedCredentials: RequestCredentials | null = null;

    globalThis.fetch = async (_url: any, init?: any) => {
      capturedHeaders = init?.headers as Headers;
      capturedCredentials = init?.credentials;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { ok: true } }),
      } as any;
    };

    try {
      await apiClient('/system/ping');
      assert.ok(capturedHeaders);
      assert.equal(capturedHeaders.get('X-Panel-Id'), 'fitonus-admin');
      assert.equal(capturedHeaders.get('Content-Type'), 'application/json');
      assert.equal(capturedHeaders.get('Accept'), 'application/json');
      assert.equal(capturedCredentials, 'include');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 10. Cache bypass headers and no-store mode are enforced
  it('10. Cache bypass headers and no-store mode are enforced: prevents browser caching of admin lists', async () => {
    const originalFetch = globalThis.fetch;
    let capturedHeaders: Headers | null = null;
    let capturedCache: RequestCache | undefined = undefined;

    globalThis.fetch = async (_url: any, init?: any) => {
      capturedHeaders = init?.headers as Headers;
      capturedCache = init?.cache;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { ok: true } }),
      } as any;
    };

    try {
      await apiClient('/users?page=1&limit=10');
      assert.ok(capturedHeaders);
      assert.equal(capturedHeaders.get('Cache-Control'), 'no-cache, no-store, must-revalidate');
      assert.equal(capturedHeaders.get('Pragma'), 'no-cache');
      assert.equal(capturedCache, 'no-store');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

