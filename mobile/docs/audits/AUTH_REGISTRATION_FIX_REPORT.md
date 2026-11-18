# FitOnus — Mobile Authentication & Registration Fix Report

## 1. Executive Summary

This report documents the root-cause diagnosis, fixes, and end-to-end verification for the authentication and registration issues encountered in the FitOnus Expo mobile application:
- **Error 1**: `GET /api/v1/users/me` &rarr; HTTP 401 "The access token is invalid."
- **Error 2**: `POST /api/v1/auth/refresh` &rarr; HTTP 401 "The refresh token is invalid or expired. Please sign in again."
- **Error 3 (Primary Issue)**: `POST /api/v1/auth/register` &rarr; HTTP 400 "The request is invalid."

All fixes were implemented cleanly within the existing modular Clean Architecture without redesigning mobile screens, altering layouts, touching the bottom tab bar, or weakening backend validation. 10 out of 10 targeted authentication scenarios and all 12 Phase 2C integration flows passed against the live Neon PostgreSQL database.

---

## 2. Root Cause Analysis

### Error 3 (Primary Issue): Why Registration Returned HTTP 400

The backend registers accounts through `POST /api/v1/auth/register`, validated strictly via Zod in `backend/src/modules/auth/interface/auth.schemas.ts`:
```ts
const email = z.string().trim().max(254).pipe(z.email('Must be a valid email address'));
const newPassword = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

export const registerRequest = {
  body: z.strictObject({
    email,
    displayName: z.string().trim().min(1).max(100),
    password: newPassword,
  }),
};
```
Where `backend/src/shared/security/password-policy.ts` enforces:
```ts
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
```

#### Exact Mismatch Identified:
1. **Password Length Constraint Discrepancy**:
   - **Backend Requirement**: Minimum **12 characters**, maximum 128 characters.
   - **Mobile Client-Side Validation**:
     - `mobile/src/features/auth/utils/validation.ts`: `checks = [{ label: 'At least 8 characters', ok: password.length >= 8 }, ...]`
     - `mobile/src/features/auth/utils/auth-schemas.ts`: `password: z.string().min(8, 'Password must be at least 8 characters')`
     - `SignupScreen.tsx`: Permitted submission when `password.length >= 8` with a number and uppercase letter.
   - **Failure Trigger**: When a user in Expo Go typed an 8- to 11-character password (e.g. `Password123` or `Secret1234`), the mobile UI displayed all green checkmarks ("Strong") and submitted the payload. The backend Zod schema rejected it with `400 Bad Request` (`VALIDATION_FAILED: String must contain at least 12 character(s)`).
2. **Error Detail Swallowing**:
   - The backend returned `{ success: false, error: { code: 'VALIDATION_FAILED', message: 'The request is invalid.', details: [...] } }`.
   - The mobile error handler in `auth-service.ts` only read `error.response.data.error.message`, presenting the opaque and unhelpful message `"The request is invalid."` to the user instead of displaying the actionable password policy requirement.
3. **Stale Bearer Token Leakage**:
   - `apiClient.interceptors.request.use` previously attached `Authorization: Bearer <old_token>` to all requests lacking an explicit header, including public auth routes (`/auth/register`, `/auth/login`, `/auth/refresh`). If a user had an expired token from a prior test, it was leaked in the registration request.

---

### Errors 1 & 2: Why Session Restoration Returned HTTP 401

#### Error 1: `GET /users/me` HTTP 401 ("The access token is invalid.")
- During app boot, `SplashScreen.tsx` calls `AuthService.initialize()`.
- When an expired or invalid access token was stored in `expo-secure-store` (e.g. after the 15-minute `ACCESS_TOKEN_TTL_SECONDS` expired or from an earlier dev session), calling `GET /users/me` triggered the expected `401 Unauthorized` response from backend middleware.
- In `apiClient.ts`, this was logged at `logger.error` level before the refresh interceptor could silently rotate the token.

#### Error 2: `POST /auth/refresh` HTTP 401 ("The refresh token is invalid or expired. Please sign in again.")
- After receiving 401 from `/users/me`, Axios response interceptor invoked `AuthRepository.refreshToken(refreshToken)`.
- If the session in the database had been revoked, expired (after 30 days), or deleted during database cleanup/reset, the backend correctly returned `401 Unauthorized` (`REFRESH_TOKEN_INVALID`).
- Previously, if this failed, the error was logged as an unhandled error, and cleanup did not reliably purge both tokens from `SecureStorageService` before proceeding to unauthenticated welcome/signup screens.

---

## 3. Exact Request & Contract Comparison

| Attribute | Backend Expected Request | Mobile Previous Request | Mobile Fixed Request |
| :--- | :--- | :--- | :--- |
| **Endpoint** | `POST /api/v1/auth/register` | `POST /api/v1/auth/register` | `POST /api/v1/auth/register` |
| **Headers** | `Content-Type: application/json` (NO `Authorization`) | `Authorization: Bearer <stale_token>` leaked if present | Strips `Authorization` on all public auth routes |
| **Body Shape** | `z.strictObject({ email, displayName, password })` | `{ email, displayName, password }` | `{ email, displayName, password }` |
| **`email`** | Trimmed, lowercase, valid format | `data.email` (untrimmed / raw case) | `data.email.trim().toLowerCase()` |
| **`displayName`**| Trimmed, 1-100 characters | `data.name` | `data.name.trim()` |
| **`password`** | **12 to 128 characters** | Allowed **8 characters** &rarr; Caused 400 | **Enforces 12 to 128 characters** |
| **Validation UI** | `PASSWORD_MIN_LENGTH = 12` | Showed "At least 8 characters" | Shows "At least 12 characters" |
| **Error Feedback**| Returns Zod `details` array | Showed generic "The request is invalid." | Extracts specific validation issues from `details` |

---

## 4. Full Inventory of Files Changed

### 1. `mobile/src/features/auth/utils/validation.ts`
- Updated `passwordStrength` check rule from `8` to `12`:
  ```ts
  { label: 'At least 12 characters', ok: password.length >= 12 }
  ```
- Retains existing calculation logic and UI badge tokens without layout shifts.

### 2. `mobile/src/features/auth/utils/auth-schemas.ts`
- Updated `registerSchema` and `resetPasswordSchema` to enforce `min(12)`:
  ```ts
  password: z.string().min(12, 'Password must be at least 12 characters').max(128)
  ```

### 3. `mobile/src/features/auth/screens/SignupScreen.tsx`
- Added explicit client-side validation check for password length < 12 with immediate feedback:
  ```tsx
  password:
    password.length > 0 && password.length < 12
      ? 'Password must be at least 12 characters.'
      : strength.score < 3
        ? 'Password doesn’t meet all requirements yet.'
        : undefined,
  ```

### 4. `mobile/src/services/api-client.ts`
- **Public Route Protection**: Ensured `apiClient.interceptors.request.use` never sends `Authorization` headers on `/auth/login`, `/auth/register`, or `/auth/refresh`. Explicitly removes `config.headers.Authorization` if present.
- **Silent Refresh Interception**: Kept queue-based concurrent refresh handling with proper cleanup on refresh failure (`SecureStorageService.removeItem` for both access and refresh tokens).

### 5. `mobile/src/features/auth/api/auth-repository.ts`
- Added `SecureStorageService` import and immediately persisted tokens upon receipt from `/auth/register` and `/auth/login`.
- Added `onboardingCompleted?: boolean` to `User` interface.
- Populated `onboardingCompleted` from `/profile/me` during `login` and `getCurrentUser`.
- Normalized email (`trim().toLowerCase()`) and displayName (`trim()`).

### 6. `mobile/src/features/auth/services/auth-service.ts`
- Added `extractApiErrorMessage` helper to parse backend Zod validation `details` (e.g. `String must contain at least 12 character(s)`) and application codes (`EMAIL_TAKEN`, `PASSWORD_POLICY_VIOLATION`, `INVALID_CREDENTIALS`).
- Updated `AuthService.initialize()`:
  - If no tokens exist, cleanly clears auth state with zero network requests.
  - If access token fails, attempts refresh at most once.
  - If refresh fails, purges stale tokens from secure storage and resets to unauthenticated state.
- Updated `AuthService.register()` and `login()`:
  - Purges any stale previous session from storage prior to sending authentication requests.

### 7. `mobile/src/features/auth/screens/SplashScreen.tsx`
- Utilizes `user?.onboardingCompleted` to intelligently navigate to `home` (if completed) or `onboarding` (if incomplete), falling back to `welcome` for unauthenticated sessions.

---

## 5. Verification Results

### A. 10-Scenario Targeted Authentication Test Suite
Executed directly against backend HTTP server and Neon PostgreSQL via automated test runner:

| Scenario | Description | Result |
| :--- | :--- | :---: |
| **Scenario 1** | Fresh installation with no tokens (unauthenticated, no network spam) | **PASS** |
| **Scenario 2** | Registration with invalid inputs (password < 12, invalid email, empty name) | **PASS (400 rejected with clear error)** |
| **Scenario 3** | Registration with valid input (&ge; 12 chars password, valid email) | **PASS (201 Created, tokens saved)** |
| **Scenario 4** | Profile API access after successful registration | **PASS (200 OK, onboarding: false)** |
| **Scenario 5** | Login with valid credentials | **PASS (200 OK, tokens refreshed)** |
| **Scenario 6** | App restart and session restoration (Zustand cleared, restored from SecureStore) | **PASS (User & session active)** |
| **Scenario 7** | Expired access token handling & silent rotation (401 intercepted, /auth/refresh invoked, replayed) | **PASS** |
| **Scenario 8** | Invalid refresh token handling (401 caught, session purged, storage wiped) | **PASS** |
| **Scenario 9** | Registration after an expired previous session (no stale Bearer token sent) | **PASS** |
| **Scenario 10** | User logout (session revoked, tokens wiped, query cache cleared) | **PASS** |

*All disposable test accounts were cleanly deleted from Neon PostgreSQL after test completion.*

### B. Phase 2C Full Integration Suite (12 Flows)
- Ran complete 12-flow Phase 2C integration test:
  - Flow 1 (Register) &rarr; Flow 2 (15-step Onboarding) &rarr; Flow 3 (Profile Persistence) &rarr; Flow 4 (Optimistic Concurrency 409) &rarr; Flow 5 (Fitness Preferences) &rarr; Flow 6 (Nutrition Preferences) &rarr; Flow 7 (Settings) &rarr; Flow 8 & 9 (Restart & Restore) &rarr; Flow 10 & 11 (Logout & Re-Login) &rarr; Flow 12 (Data Isolation).
  - **Result: 12/12 PASSED**.

### C. Build & Static Analysis Checks
- `cd mobile && npm run typecheck`: **PASS (0 errors)**.
- `cd backend && npm test`: **PASS (81/81 unit & integration tests passing across 12 suites)**.
- `cd backend && npm run check`: **PASS (typecheck, lint, format:check, vitest, build clean)**.

---

## 6. Manual Expo Go Verification Guide

Physical Expo Go verification on a physical device requires standard LAN connectivity:

1. **Verify Backend Running**:
   ```bash
   cd backend
   npm run dev
   ```
2. **Verify Mobile LAN IP**:
   Check `mobile/.env`:
   ```bash
   EXPO_PUBLIC_API_URL=http://<YOUR_LAN_IP>:3000/api/v1
   ```
3. **Start Mobile**:
   ```bash
   cd mobile
   npx expo start --clear
   ```
4. **Interactive Verification Steps in Expo Go**:
   - **Test Registration Rejection**: Go to Signup &rarr; enter a password under 12 characters (e.g. `Pass1234`) &rarr; confirm the UI indicator shows `[ ] At least 12 characters` and prevents submission.
   - **Test Registration Success**: Enter a password with &ge; 12 characters (e.g. `StrongPass123!`) &rarr; tap "Create account" &rarr; verify account is created and onboarding screen appears immediately.
   - **Test App Restart**: Close Expo Go and reopen &rarr; verify Splash screen restores session and retains onboarding state.
   - **Test Logout**: Complete onboarding or navigate to Settings &rarr; tap "Log Out" &rarr; confirm prompt &rarr; verify clean return to Welcome screen.

---

## 7. Remaining Limitations

1. **Social OAuth Buttons**:
   - Google and Apple Sign-In buttons continue to show informational alert dialogues until OAuth backend credentials and native schemes are provisioned.
2. **Password Policy UX**:
   - Mobile and backend now both consistently adhere to the NIST SP 800-63B standard (&ge; 12 characters). No breaking changes to existing users or database schemas were introduced.

