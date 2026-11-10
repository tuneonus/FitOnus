# FitOnus Admin Portal — Login Success → Dashboard → Login Redirect Bug Fix Report

**Report Date:** November 9, 2026  
**Frontend (Vercel Admin Portal):** `https://fit-onus.vercel.app`  
**Backend (Render DEV API):** `https://fitonus-api-dev.onrender.com/api/v1`  
**Issue:** User logs in successfully (`POST /api/v1/admin/auth/login` → 200 OK), dashboard mounts briefly, browser immediately redirects back to `/login`.

---

## 1. Executive Summary & Root Cause Analysis

### Observed Bug Behavior
1. User enters valid admin credentials on `https://fit-onus.vercel.app/login`.
2. `POST /api/v1/admin/auth/login` succeeds with HTTP 200 and returns `{ tokenType: 'Bearer', accessToken: '...', user: { ... } }`.
3. The Admin dashboard at `/` opens for a fraction of a second.
4. The application immediately bounces back to `/login`.
5. Refreshing the dashboard on `/` immediately redirects back to `/login`.

### Root Cause
The root cause was a **cross-origin session drop coupled with client-side token omission**:

1. **Cross-Site Cookie Drop (`SameSite=Lax` across distinct eTLD+1 domains):**  
   The frontend is hosted on `fit-onus.vercel.app` while the backend is on `fitonus-api-dev.onrender.com`. Because these are different eTLD+1 domains, all fetch requests between them are classified as **cross-site**.  
   The backend previously set session cookies as:  
   `fitonus_admin_token=${accessToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=900`.  
   Under RFC 6265bis and modern browser security standards, `SameSite=Lax` cookies are **never attached to cross-site subresource fetch requests**.

2. **Frontend Discarded Access Token & Relied Solely on Cookies:**  
   In [`admin/src/features/auth/api.ts`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/admin/src/features/auth/api.ts#L18-L23), the `login()` function unpacked the response but discarded `res.data.accessToken` without saving it to client storage (`localStorage` or session memory).  
   In [`admin/src/lib/api-client.ts`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/admin/src/lib/api-client.ts#L41-L46), `apiClient` only passed `credentials: 'include'` and **never added the `Authorization: Bearer <token>` header**.

3. **Subsequent Dashboard Requests Triggered 401 & Session Expiration Event:**  
   When the user navigated to `/`, dashboard components mounted and immediately queried the backend (e.g. `GET /api/v1/admin/dashboard/stats` and `GET /api/v1/admin/auth/me`).  
   Because the browser dropped the `SameSite=Lax` cookie and no `Authorization` header was present, the Render backend received an unauthenticated request and returned **HTTP 401 UNAUTHORIZED**.  
   In `admin/src/lib/api-client.ts`:
   ```ts
   if (res.status === 401 && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
     window.dispatchEvent(new CustomEvent('fitonus:auth:expired', { detail: { message } }));
   }
   ```
   `AuthContext.tsx` caught this event, executed `setUser(null)`, and called `router.replace('/login')`, creating the immediate bounce-back loop.

---

## 2. Technical Mechanism Analysis: Bearer vs Cookie vs Race Condition

| Dimension | Previous State | Fixed State | Result |
| :--- | :--- | :--- | :--- |
| **Authentication Mechanism** | Pure `HttpOnly` cookie with `SameSite=Lax` | **Dual Defense**: Bearer token via `Authorization: Bearer <token>` + `SameSite=None; Secure; Partitioned` cookie | Cross-site fetch calls from Vercel to Render succeed across all browsers (including Chrome, Safari ITP, Brave). |
| **Token Persistence** | Token discarded by `authApi.login()`; no storage helper | Safe persistent storage via [`admin/src/lib/token-storage.ts`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/admin/src/lib/token-storage.ts) | Access token retained across dashboard navigation and page refreshes. |
| **Request Header Injection** | `apiClient` sent only `X-Panel-Id`, `Content-Type`, `Accept` | `apiClient` checks `getAuthToken()` and injects `Authorization: Bearer <token>` | Protected endpoints receive verified credentials. |
| **Hydration / Route Guard Race** | On refresh, `initAuth()` made `getMe()` without credentials, failed 401, forced logout | `initAuth()` reads stored token, verifies with `getMe()` with Bearer token, keeps `isLoading=true` until verified | Zero premature redirects during hydration; authenticated sessions remain open. |
| **Expiration & Logout Handling** | Expiration listener cleared user state but left orphan cookie | Expiration listener and `logout()` clear both stored token and state, ensuring clean logout | Safe lifecycle without lingering sessions or loops. |

---

## 3. Files Modified & Implementation Details

### 1. `admin/src/lib/token-storage.ts` (New File)
Created an SSR-safe token storage helper providing:
- `getAuthToken(): string | null`
- `setAuthToken(token: string): void`
- `clearAuthToken(): void`
Safeguarded with `typeof window === 'undefined'` checks and `try/catch` blocks for restricted/private-browsing environments.

### 2. `admin/src/features/auth/types.ts`
Updated `AdminLoginResult` interface to expose `accessToken?: string;`.

### 3. `admin/src/features/auth/api.ts`
- In `login()`: Persists the returned `accessToken` via `setAuthToken(res.data.accessToken)`.
- In `logout()`: Ensures `clearAuthToken()` is called in a `finally` block.

### 4. `admin/src/lib/api-client.ts`
- Imports `getAuthToken()`.
- Automatically injects `Authorization: Bearer <token>` into fetch request headers whenever a token exists and the caller hasn't explicitly overridden it.
- Preserves `credentials: 'include'` and CSRF mitigation headers (`X-Panel-Id`).

### 5. `admin/src/features/auth/context/AuthContext.tsx`
- **Hydration:** In `initAuth()`, checks `getAuthToken()`. If no token exists, immediately sets `user = null` and `isLoading = false` without firing an unauthenticated network request. If a token exists, validates with `authApi.getMe()`. If verification fails, purges token via `clearAuthToken()`.
- **Session Expiration:** When `fitonus:auth:expired` is received, purges token via `clearAuthToken()`, sets `user = null`, and redirects to `/login`.
- **Logout:** In `logout()`, clears token and user state, redirecting to `/login`.

### 6. `backend/src/modules/admin/interface/admin.controller.ts`
- Enhanced cookie attributes for production/HTTPS environments:
  - If `isProduction` is true: uses `SameSite=None; Secure; Partitioned` (CHIPS compliance for cross-site cookie defense-in-depth).
  - If `isProduction` is false (local HTTP development): falls back to `SameSite=Lax` without `Secure`.

---

## 4. Verification & Regression Test Results

### Step 5 Regression Test Matrix (9/9 Criteria Verified)

| # | Regression Test Requirement | Test File & Suite | Result |
| :--- | :--- | :--- | :--- |
| **1** | Successful login persists authenticated state | `admin/tests/admin-auth-session.test.ts` (Test 1) | **PASS** |
| **2** | Dashboard stays open after login | `admin/tests/admin-auth-session.test.ts` (Test 2) | **PASS** |
| **3** | Page refresh retains valid session | `admin/tests/admin-auth-session.test.ts` (Test 3) | **PASS** |
| **4** | `auth/me` verification succeeds | `admin/tests/admin-auth-session.test.ts` (Test 4) | **PASS** |
| **5** | Expired/invalid sessions redirect correctly | `admin/tests/admin-auth-session.test.ts` (Test 5) | **PASS** |
| **6** | Logout clears session & stored token | `admin/tests/admin-auth-session.test.ts` (Test 6) | **PASS** |
| **7** | Non-admin users remain blocked (403) | `admin/tests/admin-auth-session.test.ts` (Test 7) | **PASS** |
| **8** | No infinite login redirect loop (401 on `/login` suppressed) | `admin/tests/admin-auth-session.test.ts` (Test 8) | **PASS** |
| **9** | Existing CORS behavior remains intact (`X-Panel-Id`, preflight) | `admin/tests/admin-auth-session.test.ts` (Test 9) | **PASS** |

### Test Execution Summary

#### 1. Admin Test Suite (`node:test` via `tsx`)
```bash
npm --prefix admin test
```
- **Passed Suites:** 8 / 8
- **Passed Tests:** 79 / 79
- **Failed Tests:** 0
- **Duration:** 852ms

#### 2. Admin TypeScript Typecheck
```bash
./backend/node_modules/.bin/tsc -p admin/tsconfig.json --noEmit
```
- **Exit Code:** 0 (0 errors)

#### 3. Backend Admin Unit Tests (`vitest`)
```bash
npx --prefix backend vitest run tests/unit/admin
```
- **Passed Test Files:** 5 / 5
- **Passed Tests:** 49 / 49
- **Failed Tests:** 0
- **Duration:** 2.59s

#### 4. Full Backend Unit Test Suite (`vitest`)
```bash
npx --prefix backend vitest run backend/tests/unit
```
- **Passed Test Files:** 78 / 78
- **Passed Tests:** 758 / 758
- **Failed Tests:** 0
- **Duration:** 8.38s

#### 5. Backend TypeScript Typecheck
```bash
npm --prefix backend run typecheck
```
- **Exit Code:** 0 (0 errors)

---

## 5. Deployment Requirements & Deployment Plan

### Required Actions

1. **Vercel Frontend Redeployment:**
   - **Required:** Yes. The admin frontend (`fit-onus.vercel.app`) contains the Bearer token persistence logic, `apiClient` header injection, and `AuthContext` hydration fix.
   - **Environment Variables:** No changes required (`NEXT_PUBLIC_API_URL` already points to `https://fitonus-api-dev.onrender.com/api/v1/admin`).

2. **Render DEV Backend Redeployment:**
   - **Required:** Yes (for cookie defense-in-depth). The backend controller changes provide `SameSite=None; Secure; Partitioned` cookie attributes in production.
   - **Environment Variables:** No changes required (`CORS_ORIGINS` already includes `https://fit-onus.vercel.app` with `Authorization` allowed).

3. **Database Changes:**
   - **Required:** None. No schema modifications, migrations, or data alterations are required on Neon DEV. Neon PROD was untouched.

---

## 6. Production / Post-Deployment Verification Checklist

1. [ ] **Navigate to Admin Login:** Open `https://fit-onus.vercel.app/login` in an Incognito window.
2. [ ] **Submit Valid Credentials:** Enter `admin@fitonus.com` with the administrative password.
3. [ ] **Verify Network Payload:** Inspect Developer Tools Network tab:
   - `POST /api/v1/admin/auth/login` returns HTTP 200 with `accessToken` in body.
   - `localStorage.getItem('fitonus_admin_access_token')` is populated.
4. [ ] **Verify Dashboard Stability:** Observe navigation to `https://fit-onus.vercel.app/`. Ensure dashboard stays open and does NOT redirect to `/login`.
5. [ ] **Verify Bearer Header on Subsequent Requests:** Check `GET /api/v1/admin/dashboard/stats`:
   - Request includes `authorization: Bearer <token>`.
   - Response is HTTP 200 OK with dashboard metrics.
6. [ ] **Verify Page Refresh Retention:** Press `F5` / Refresh on `/`. Verify the user remains authenticated and does not get redirected to `/login`.
7. [ ] **Verify Session Logout:** Click "Sign Out" in the admin sidebar. Verify token is cleared from `localStorage` and page redirects cleanly to `/login`.
8. [ ] **Verify Bad Credentials Handling:** Enter invalid password on `/login`. Verify "Invalid email or password" error banner appears without page flicker or loops.

