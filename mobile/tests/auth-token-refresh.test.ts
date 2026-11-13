import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { apiClient } from '../src/services/api-client';
import { SecureStorageService } from '../src/services/secure-storage';
import { AuthService } from '../src/features/auth/services/auth-service';
import { useAuthStore } from '../src/features/auth/stores/auth-store';

const ACCESS = 'auth.access_token';
const REFRESH = 'auth.refresh_token';
const USER = { id: 'u1', name: 'T', email: 't@example.com', isEmailVerified: true };

/** In-memory stand-in for the backend: access tokens expire, refresh tokens rotate and detect reuse. */
class FakeBackend {
  validAccess = new Set<string>();
  currentRefresh = 'rt-1';
  revoked = false;
  refreshCalls = 0;
  refreshDelayMs = 0;
  refreshMode: 'ok' | 'reject' | 'network' | 'server-error' = 'ok';
  analyticsCalls = 0;
  /** Access token returned by refresh is rejected by the API (defence against retry loops). */
  issueBadAccess = false;
  private n = 1;
  seenRefreshAuthHeader: unknown[] = [];

  private fail(config: InternalAxiosRequestConfig, status: number, code: string, message: string) {
    const response = {
      status,
      statusText: String(status),
      headers: {},
      config,
      data: { success: false, error: { code, message } },
    };
    return new AxiosError(message, 'ERR_BAD_REQUEST', config, null, response as never);
  }

  adapter: AxiosAdapter = async (config) => {
    const url = config.url ?? '';
    const ok = (data: unknown) => ({
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      data: { success: true, data },
    });
    if (url.includes('/auth/refresh')) {
      this.refreshCalls++;
      this.seenRefreshAuthHeader.push(config.headers?.Authorization);
      if (this.refreshDelayMs) await new Promise((r) => setTimeout(r, this.refreshDelayMs));
      if (this.refreshMode === 'network') throw new AxiosError('Network Error', 'ERR_NETWORK', config);
      if (this.refreshMode === 'server-error') throw this.fail(config, 503, 'UNAVAILABLE', 'down');
      const body = JSON.parse(config.data as string);
      if (this.refreshMode === 'reject' || this.revoked) {
        throw this.fail(config, 401, 'INVALID_REFRESH_TOKEN', 'The refresh token is invalid.');
      }
      if (body.refreshToken !== this.currentRefresh) {
        this.revoked = true; // reuse detection revokes the whole session
        throw this.fail(config, 401, 'REFRESH_TOKEN_REUSED', 'The refresh token was already used.');
      }
      this.n++;
      this.currentRefresh = `rt-${this.n}`;
      const access = this.issueBadAccess ? `bad-${this.n}` : `at-${this.n}`;
      if (!this.issueBadAccess) this.validAccess.add(access);
      return ok({ accessToken: access, refreshToken: this.currentRefresh });
    }
    if (url.includes('/progress/analytics')) {
      this.analyticsCalls++;
      const token = String(config.headers?.Authorization ?? '').replace('Bearer ', '');
      if (!this.validAccess.has(token) || this.revoked) {
        throw this.fail(config, 401, 'TOKEN_EXPIRED', 'The access token has expired.');
      }
      return ok({ points: [], token });
    }
    if (url.includes('/users/me') || url.includes('/profile/me')) {
      const token = String(config.headers?.Authorization ?? '').replace('Bearer ', '');
      if (!this.validAccess.has(token) || this.revoked) {
        throw this.fail(config, 401, 'TOKEN_EXPIRED', 'The access token has expired.');
      }
      return ok({ id: USER.id, displayName: USER.name, email: USER.email, onboardingCompleted: true });
    }
    throw new Error(`unexpected ${url}`);
  };
}

let backend: FakeBackend;

async function signInWithExpiredAccessToken() {
  await SecureStorageService.setItem(ACCESS, 'at-expired');
  await SecureStorageService.setItem(REFRESH, backend.currentRefresh);
  useAuthStore.getState().setAuth(USER);
}

describe('API client: expired access token handling', () => {
  beforeEach(async () => {
    backend = new FakeBackend();
    apiClient.defaults.adapter = backend.adapter;
    await SecureStorageService.removeItem(ACCESS);
    await SecureStorageService.removeItem(REFRESH);
    useAuthStore.getState().clearAuth();
  });

  it('passes a request through untouched while the access token is valid', async () => {
    backend.validAccess.add('at-good');
    await SecureStorageService.setItem(ACCESS, 'at-good');
    await SecureStorageService.setItem(REFRESH, 'rt-1');
    const res = await apiClient.get('/progress/analytics');
    assert.equal(res.status, 200);
    assert.equal(backend.refreshCalls, 0);
  });

  it('refreshes once on an expired access token, stores both new tokens and retries the request', async () => {
    await signInWithExpiredAccessToken();
    const res = await apiClient.get('/progress/analytics');
    assert.equal(res.status, 200);
    assert.equal(backend.refreshCalls, 1);
    assert.equal(backend.analyticsCalls, 2); // original + exactly one retry
    assert.equal(await SecureStorageService.getItem(ACCESS), 'at-2');
    assert.equal(await SecureStorageService.getItem(REFRESH), 'rt-2');
    assert.equal(useAuthStore.getState().isAuthenticated, true);
    assert.equal(res.data.data.token, 'at-2');
  });

  it('sends the refresh request without an Authorization header', async () => {
    await signInWithExpiredAccessToken();
    await apiClient.get('/progress/analytics');
    assert.deepEqual(backend.seenRefreshAuthHeader, [undefined]);
  });

  it('shares one refresh between concurrent expired requests and retries every one', async () => {
    backend.refreshDelayMs = 20;
    await signInWithExpiredAccessToken();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => apiClient.get('/progress/analytics')),
    );
    assert.ok(results.every((r) => r.status === 200));
    assert.equal(backend.refreshCalls, 1);
    assert.equal(backend.revoked, false);
    assert.equal(await SecureStorageService.getItem(REFRESH), 'rt-2');
  });

  it('does not refresh again for a late 401 that was sent with the pre-refresh token', async () => {
    await signInWithExpiredAccessToken();
    // Fire a slow request with the stale token, let a fast one finish the refresh first.
    const slowAdapter = backend.adapter;
    let releaseSlow!: () => void;
    const gate = new Promise<void>((r) => (releaseSlow = r));
    let first = true;
    apiClient.defaults.adapter = async (config) => {
      if (String(config.url).includes('/progress/analytics') && first) {
        first = false;
        await gate; // this request is "in flight" with the stale token
      }
      return slowAdapter(config);
    };
    const slow = apiClient.get('/progress/analytics');
    await new Promise((r) => setTimeout(r, 5));
    await apiClient.get('/progress/analytics'); // refreshes
    releaseSlow();
    const res = await slow;
    assert.equal(res.status, 200);
    assert.equal(backend.refreshCalls, 1);
    assert.equal(backend.revoked, false);
  });

  it('does not loop when the refreshed token is still rejected: one retry, then surfaces the 401', async () => {
    backend.issueBadAccess = true;
    await signInWithExpiredAccessToken();
    await assert.rejects(apiClient.get('/progress/analytics'), (e: any) => e.response?.status === 401);
    assert.equal(backend.refreshCalls, 1);
    assert.equal(backend.analyticsCalls, 2);
  });

  it('does not loop for concurrent requests when the refreshed token is still rejected', async () => {
    backend.issueBadAccess = true;
    backend.refreshDelayMs = 10;
    await signInWithExpiredAccessToken();
    const settled = await Promise.allSettled(
      Array.from({ length: 4 }, () => apiClient.get('/progress/analytics')),
    );
    assert.ok(settled.every((s) => s.status === 'rejected'));
    assert.equal(backend.refreshCalls, 1);
    assert.equal(backend.analyticsCalls, 8); // 4 originals + 4 single retries
  });

  it('clears the session and tokens when the refresh token is rejected, for every waiting request', async () => {
    backend.refreshMode = 'reject';
    backend.refreshDelayMs = 10;
    await signInWithExpiredAccessToken();
    const settled = await Promise.allSettled([
      apiClient.get('/progress/analytics'),
      apiClient.get('/progress/analytics'),
      apiClient.get('/progress/analytics'),
    ]);
    assert.ok(settled.every((s) => s.status === 'rejected'));
    assert.equal(backend.refreshCalls, 1);
    assert.equal(await SecureStorageService.getItem(ACCESS), null);
    assert.equal(await SecureStorageService.getItem(REFRESH), null);
    assert.equal(useAuthStore.getState().isAuthenticated, false);
    assert.equal(useAuthStore.getState().user, null);
  });

  it('clears the session when no refresh token is stored, without calling the refresh endpoint', async () => {
    await SecureStorageService.setItem(ACCESS, 'at-expired');
    useAuthStore.getState().setAuth(USER);
    await assert.rejects(apiClient.get('/progress/analytics'));
    assert.equal(backend.refreshCalls, 0);
    assert.equal(useAuthStore.getState().isAuthenticated, false);
  });

  it('keeps the session when the refresh fails for a transient reason (offline / 5xx)', async () => {
    for (const mode of ['network', 'server-error'] as const) {
      backend = new FakeBackend();
      backend.refreshMode = mode;
      apiClient.defaults.adapter = backend.adapter;
      await signInWithExpiredAccessToken();
      await assert.rejects(apiClient.get('/progress/analytics'));
      assert.equal(useAuthStore.getState().isAuthenticated, true, mode);
      assert.equal(await SecureStorageService.getItem(REFRESH), 'rt-1', mode);
    }
  });

  it('never refreshes in response to a 401 from the refresh endpoint itself', async () => {
    backend.refreshMode = 'reject';
    await signInWithExpiredAccessToken();
    await assert.rejects(apiClient.get('/progress/analytics'));
    assert.equal(backend.refreshCalls, 1);
  });

  it('allows a later expiry to refresh again after an earlier successful refresh', async () => {
    await signInWithExpiredAccessToken();
    await apiClient.get('/progress/analytics');
    backend.validAccess.clear(); // access token expires again
    await apiClient.get('/progress/analytics');
    assert.equal(backend.refreshCalls, 2);
    assert.equal(await SecureStorageService.getItem(REFRESH), 'rt-3');
  });

  it('cold start with an expired access token refreshes exactly once and restores the session', async () => {
    await SecureStorageService.setItem(ACCESS, 'at-expired');
    await SecureStorageService.setItem(REFRESH, backend.currentRefresh);
    await AuthService.initialize();
    assert.equal(backend.refreshCalls, 1);
    assert.equal(backend.revoked, false);
    assert.equal(useAuthStore.getState().isAuthenticated, true);
    assert.equal(await SecureStorageService.getItem(REFRESH), 'rt-2');
  });

  it('cold start with a revoked refresh token clears storage and leaves the user signed out', async () => {
    backend.refreshMode = 'reject';
    await SecureStorageService.setItem(ACCESS, 'at-expired');
    await SecureStorageService.setItem(REFRESH, backend.currentRefresh);
    await AuthService.initialize();
    assert.equal(useAuthStore.getState().isAuthenticated, false);
    assert.equal(await SecureStorageService.getItem(ACCESS), null);
    assert.equal(await SecureStorageService.getItem(REFRESH), null);
    assert.equal(backend.refreshCalls, 1); // not replayed with a stale copy
  });
});
