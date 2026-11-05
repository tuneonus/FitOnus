# FitOnus Backend Audit — Complete API Endpoint Inventory

**Document Reference:** `FitOnus/backend/BACKEND_AUDIT/API_ENDPOINT_INVENTORY.md`  
**Status:** Complete & Verified Technical Audit  
**Date:** 2026-11-04  
**Auditor:** Senior Backend Architect  
**Classification:** Confidential Technical Assessment

---

## 1. Executive Endpoint Summary

The current FitOnus backend exposes **19 total endpoints** across three route groups and the OpenAPI documentation endpoint [V]:
- **Health Probes:** 2 endpoints (`/health/*`)
- **Authentication Module:** 8 endpoints (`/api/v1/auth/*`)
- **Users Module:** 8 endpoints (`/api/v1/users/*`)
- **OpenAPI Schema:** 1 endpoint (`/api/v1/openapi.json`)

All mutating endpoints support structured JSON payloads. All protected endpoints require a Bearer access token transmitted in the `Authorization: Bearer <JWT>` header.

---

## 2. API Contract & Response Envelopes

The backend enforces standard response envelopes defined in `src/shared/http/route.ts` and `src/middleware/error-handler.ts` [V]:

### 2.1 Standard Success Envelope
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation completed successfully",
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

### 2.2 Standard Error Envelope
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request body failed validation.",
    "requestId": "req_01h8q...",
    "details": {
      "issues": [
        { "field": "email", "message": "Invalid email address format" }
      ]
    }
  }
}
```

---

## 3. Complete Endpoint Inventory Table

| # | Method | Path | Summary & Purpose | Access Level | Permission Required | Rate Limiter | Controller & Handler | Source Route File |
|---|---|---|---|---|---|---|---|---|
| **1** | `GET` | `/health/live` | Process liveness check | Public | None | None (Bypassed) | Inline handler | `src/modules/health/health.routes.ts:18` |
| **2** | `GET` | `/health/ready` | Readiness check (tests PostgreSQL connection & shutdown state) | Public | None | None (Bypassed) | Inline handler (checks `db.ping()`) | `src/modules/health/health.routes.ts:27` |
| **3** | `GET` | `/api/v1/openapi.json` | Serves OpenAPI 3.1 JSON schema generated from code | Public | None | Global Limiter | Express inline handler | `src/app.ts:53` |
| **4** | `POST` | `/api/v1/auth/register` | Self-service registration (only when `AUTH_PUBLIC_REGISTRATION=true`) | Public | None | Register Limiter (10/15m) | `authController.register` -> `RegisterUseCase` | `src/modules/auth/interface/auth.routes.ts:32` |
| **5** | `POST` | `/api/v1/auth/login` | Sign in with email and password | Public | None | Login Limiter (10/15m per IP+Email) | `authController.login` -> `LoginUseCase` | `src/modules/auth/interface/auth.routes.ts:49` |
| **6** | `POST` | `/api/v1/auth/refresh` | Single-use refresh token rotation | Public | None | Refresh Limiter (60/15m) | `authController.refresh` -> `RefreshTokenUseCase` | `src/modules/auth/interface/auth.routes.ts:61` |
| **7** | `POST` | `/api/v1/auth/logout` | Revoke current active session | Authenticated | None | Global Limiter | `authController.logout` -> `LogoutUseCase` | `src/modules/auth/interface/auth.routes.ts:79` |
| **8** | `POST` | `/api/v1/auth/logout-all`| Revoke all active sessions of the user | Authenticated | None | Global Limiter | `authController.logoutAll` -> `LogoutUseCase` | `src/modules/auth/interface/auth.routes.ts:93` |
| **9** | `GET` | `/api/v1/auth/sessions` | List active sessions of the current user | Authenticated | None | Global Limiter | `authController.listSessions` -> `ListSessionsUseCase` | `src/modules/auth/interface/auth.routes.ts:107` |
| **10**| `DELETE`| `/api/v1/auth/sessions/:id` | Revoke a specific active session by ID | Authenticated | None (Ownership enforced in use case) | Global Limiter | `authController.revokeSession` -> `RevokeSessionUseCase` | `src/modules/auth/interface/auth.routes.ts:121` |
| **11**| `POST` | `/api/v1/auth/change-password` | Change password and revoke all other sessions | Authenticated | None | Sensitive Limiter (10/15m) | `authController.changePassword` -> `ChangePasswordUseCase` | `src/modules/auth/interface/auth.routes.ts:137` |
| **12**| `POST` | `/api/v1/users` | Admin account creation (Supports `Idempotency-Key` header) | Permission | `users:create` | Global Limiter | `usersController.create` -> `CreateUserUseCase` | `src/modules/users/interface/users.routes.ts:19` |
| **13**| `GET` | `/api/v1/users` | List users with pagination, search, and filters | Permission | `users:read` | Global Limiter | `usersController.list` -> `ListUsersUseCase` | `src/modules/users/interface/users.routes.ts:38` |
| **14**| `GET` | `/api/v1/users/me` | Retrieve profile of the currently signed-in user | Authenticated | None | Global Limiter | `usersController.getMe` -> `GetUserUseCase` | `src/modules/users/interface/users.routes.ts:54` |
| **15**| `PATCH`| `/api/v1/users/me` | Update profile of the currently signed-in user | Authenticated | None | Global Limiter | `usersController.updateMe` -> `UpdateUserUseCase` | `src/modules/users/interface/users.routes.ts:68` |
| **16**| `GET` | `/api/v1/users/:id` | Get user by ID (Self or requires `users:read`) | Authenticated | Ownership or `users:read` | Global Limiter | `usersController.getById` -> `GetUserUseCase` | `src/modules/users/interface/users.routes.ts:84` |
| **17**| `PATCH`| `/api/v1/users/:id` | Update user by ID (Self or requires `users:update`) | Authenticated | Ownership or `users:update` | Global Limiter | `usersController.updateById` -> `UpdateUserUseCase` | `src/modules/users/interface/users.routes.ts:95` |
| **18**| `POST` | `/api/v1/users/:id/disable` | Disable user account and revoke all sessions | Permission | `users:manage-status` | Global Limiter | `usersController.disable` -> `DisableUserUseCase` | `src/modules/users/interface/users.routes.ts:111` |
| **19**| `POST` | `/api/v1/users/:id/enable` | Re-enable a disabled user account | Permission | `users:manage-status` | Global Limiter | `usersController.enable` -> `EnableUserUseCase` | `src/modules/users/interface/users.routes.ts:127` |

---

## 4. Request & Response Payload Specifications

### 4.1 `POST /api/v1/auth/login`
- **Request Body (`loginRequest`):**
  ```json
  {
    "email": "user@example.com",
    "password": "Password123!@#"
  }
  ```
- **Response Data (`200 OK tokensSchema`):**
  ```json
  {
    "success": true,
    "message": "Signed in",
    "data": {
      "accessToken": "eyJhbGciOiJIUzI1NiIs...",
      "refreshToken": "4f9b8c2d1e0a...",
      "expiresIn": 900
    }
  }
  ```

### 4.2 `POST /api/v1/auth/refresh`
- **Request Body (`refreshRequest`):**
  ```json
  {
    "refreshToken": "4f9b8c2d1e0a..."
  }
  ```
- **Response Data (`200 OK tokensSchema`):**
  Returns rotated access token and single-use replacement refresh token.

### 4.3 `POST /api/v1/users` (Idempotent Creation)
- **Request Headers:**
  - `Idempotency-Key: <unique-client-uuid>` (Optional but supported)
- **Request Body (`createUserRequest`):**
  ```json
  {
    "email": "newuser@example.com",
    "displayName": "Jane Doe",
    "password": "SecurePassword123!",
    "role": "member"
  }
  ```
- **Response Data (`201 Created userViewSchema`):**
  ```json
  {
    "success": true,
    "message": "User created",
    "data": {
      "id": "7b8f9e0a-...",
      "email": "newuser@example.com",
      "displayName": "Jane Doe",
      "role": "member",
      "status": "active",
      "version": 1,
      "createdAt": "2026-11-04T12:00:00.000Z",
      "updatedAt": "2026-11-04T12:00:00.000Z"
    }
  }
  ```

---

## 5. FitOnus Endpoint Gap Analysis

Comparing the implemented endpoints against the FitOnus requirements specification (`FitOnus/docs/19-backend-api.txt`):

| Required Endpoint Group | Documented Status | Currently Implemented Status |
|---|---|---|
| **Health Checks** | `/health/live`, `/health/ready` | **100% Implemented** (2 endpoints) |
| **Authentication** | Email/Password, Refresh, Logout, Sessions | **100% Implemented** (8 endpoints) |
| **Social Auth (Google/Apple)**| Documented in `06-authentication.txt` | **0% Implemented** (Missing) |
| **User Profile Management** | Personal metrics (Height, Weight, Age, Gender) | **Partially Implemented** (Display name only; missing fitness attributes) |
| **Dashboard Aggregation** | `GET /api/v1/dashboard/summary` | **0% Implemented** (Missing) |
| **Workout & Exercises API** | `/api/v1/workouts/*`, `/exercises/*` | **0% Implemented** (Missing) |
| **Nutrition & Meals API** | `/api/v1/nutrition/*`, `/meals/*` | **0% Implemented** (Missing) |
| **Health Connect Sync API** | `/api/v1/health-connect/*` | **0% Implemented** (Missing) |
| **AI Coach Conversational API**| `/api/v1/ai/chat`, `/ai/recommendations` | **0% Implemented** (Missing) |
| **Progress & Analytics API** | `/api/v1/analytics/*`, `/reports/*` | **0% Implemented** (Missing) |
| **Notifications & Reminders** | `/api/v1/notifications/*`, `/reminders/*` | **0% Implemented** (Missing) |
| **Subscriptions API** | `/api/v1/subscriptions/*` | **0% Implemented** (Missing) |

