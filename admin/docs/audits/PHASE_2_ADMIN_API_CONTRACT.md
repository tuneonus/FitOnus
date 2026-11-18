# FitOnus Web Admin — Complete API Contract Specification

**Base URL:** `/api/v1/admin`  
**Date:** 2026-11-05  
**Protocol:** HTTPS / JSON  
**Authentication:** `Authorization: Bearer <accessToken>` OR `Cookie: fitonus_admin_token=<accessToken>`  

---

## 1. Authentication Endpoints

### 1.1 Admin Portal Login
- **Endpoint:** `POST /api/v1/admin/auth/login`
- **Access:** Public (Rate-limited)
- **Request Body:**
  ```json
  {
    "email": "admin@fitonus.com",
    "password": "AdminSecurePass123!"
  }
  ```
- **Response Headers:**
  ```
  Set-Cookie: fitonus_admin_token=<jwt>; HttpOnly; SameSite=Lax; Path=/; Max-Age=900; [Secure]
  Cache-Control: no-store
  ```
- **Response Body (200 OK):**
  ```json
  {
    "success": true,
    "message": "Signed in",
    "data": {
      "tokenType": "Bearer",
      "accessToken": "eyJhbGciOi...",
      "accessTokenExpiresAt": "2026-11-05T06:15:00.000Z",
      "refreshToken": "fitonus_rt_...",
      "refreshTokenExpiresAt": "2026-12-05T06:00:00.000Z",
      "user": {
        "id": "e7b0d911-5369-4e76-8051-b844bf7c65ef",
        "email": "admin@fitonus.com",
        "displayName": "System Admin",
        "role": "admin"
      }
    }
  }
  ```
- **Error Codes:**
  - `401 UNAUTHORIZED`: Invalid email or password.
  - `403 FORBIDDEN`: Account does not possess `role === 'admin'`.
  - `429 TOO_MANY_REQUESTS`: Rate limit exceeded.

---

### 1.2 Get Current Admin Profile
- **Endpoint:** `GET /api/v1/admin/auth/me`
- **Access:** Requires permission `admin:access`
- **Response Body (200 OK):**
  ```json
  {
    "success": true,
    "message": "Success",
    "data": {
      "id": "e7b0d911-5369-4e76-8051-b844bf7c65ef",
      "email": "admin@fitonus.com",
      "displayName": "System Admin",
      "role": "admin",
      "permissions": [
        "users:read",
        "users:create",
        "users:update",
        "users:manage-status",
        "users:assign-role",
        "admin:access",
        "admin:audit",
        "admin:stats"
      ]
    }
  }
  ```

---

### 1.3 Admin Portal Logout
- **Endpoint:** `POST /api/v1/admin/auth/logout`
- **Access:** Authenticated
- **Response Headers:**
  ```
  Set-Cookie: fitonus_admin_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0
  ```
- **Response Body (200 OK):**
  ```json
  {
    "success": true,
    "message": "Signed out",
    "data": {
      "message": "Logged out successfully"
    }
  }
  ```

---

## 2. Dashboard Analytics Endpoints

### 2.1 Get Dashboard Statistics
- **Endpoint:** `GET /api/v1/admin/dashboard/stats`
- **Access:** Requires permission `admin:stats`
- **Response Body (200 OK):**
  ```json
  {
    "success": true,
    "message": "Success",
    "data": {
      "totalUsers": 12,
      "activeUsers": 12,
      "disabledUsers": 0,
      "activeUsers7d": 8,
      "activeUsers30d": 12,
      "completedOnboarding": 4,
      "pendingOnboarding": 8,
      "newRegistrations7d": 5,
      "newRegistrations30d": 12,
      "recentUsers": [
        {
          "id": "aeb9d229-1d58-4471-a368-f64e9f963069",
          "email": "member@fitonus.com",
          "displayName": "Alex Member",
          "role": "member",
          "status": "active",
          "onboardingCompleted": true,
          "createdAt": "2026-11-05T06:12:00.000Z"
        }
      ],
      "registrationTrend": [
        { "date": "2026-10-23", "count": 1 },
        { "date": "2026-10-24", "count": 0 },
        { "date": "2026-11-05", "count": 3 }
      ]
    }
  }
  ```

---

## 3. User Management Endpoints

### 3.1 List Users
- **Endpoint:** `GET /api/v1/admin/users`
- **Access:** Requires permission `users:read`
- **Query Parameters:**
  - `page` (optional integer, default `1`)
  - `limit` (optional integer, default `20`)
  - `search` (optional string, max 100)
  - `status` (optional enum: `active` | `disabled`)
  - `role` (optional enum: `admin` | `member`)
  - `onboarding` (optional enum: `completed` | `pending`)
  - `sort` (optional enum: `createdAt` | `email` | `displayName` | `status`, default `createdAt`)
  - `order` (optional enum: `asc` | `desc`, default `desc`)
- **Response Body (200 OK):**
  ```json
  {
    "success": true,
    "message": "Success",
    "data": [
      {
        "id": "aeb9d229-1d58-4471-a368-f64e9f963069",
        "email": "member@fitonus.com",
        "displayName": "Alex Member",
        "role": "member",
        "status": "active",
        "version": 1,
        "onboardingCompleted": true,
        "currentOnboardingStep": "completed",
        "createdAt": "2026-11-05T06:12:00.000Z",
        "updatedAt": "2026-11-05T06:12:00.000Z",
        "disabledAt": null
      }
    ],
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 12,
      "totalPages": 1
    }
  }
  ```

---

### 3.2 Get User Record with Profile Metadata
- **Endpoint:** `GET /api/v1/admin/users/:id`
- **Access:** Requires permission `users:read`
- **Response Body (200 OK):**
  ```json
  {
    "success": true,
    "message": "Success",
    "data": {
      "user": {
        "id": "aeb9d229-1d58-4471-a368-f64e9f963069",
        "email": "member@fitonus.com",
        "displayName": "Alex Member",
        "role": "member",
        "status": "active",
        "version": 1,
        "createdAt": "2026-11-05T06:12:00.000Z",
        "updatedAt": "2026-11-05T06:12:00.000Z",
        "disabledAt": null
      },
      "sessionsSummary": {
        "activeSessionsCount": 1,
        "lastActiveAt": "2026-11-05T06:12:00.000Z"
      },
      "profileMetadata": {
        "hasProfile": true,
        "onboardingCompleted": true,
        "currentOnboardingStep": "completed",
        "primaryGoal": "build_muscle",
        "experienceLevel": "intermediate",
        "preferredWorkoutPlace": "gym",
        "workoutDaysPerWeek": 4,
        "preferredWorkoutDurationMin": 60,
        "dietType": "high_protein",
        "dailyCalorieTarget": 2500,
        "dailyProteinGrams": 170,
        "createdAt": "2026-11-05T06:12:00.000Z",
        "updatedAt": "2026-11-05T06:12:00.000Z"
      }
    }
  }
  ```

---

### 3.3 Suspend User Account
- **Endpoint:** `POST /api/v1/admin/users/:id/suspend`
- **Access:** Requires permission `users:manage-status`
- **Request Body:**
  ```json
  {
    "reason": "Suspected unauthorized account takeover"
  }
  ```
- **Response Body (200 OK):**
  ```json
  {
    "success": true,
    "message": "User account suspended.",
    "data": {
      "id": "aeb9d229-1d58-4471-a368-f64e9f963069",
      "email": "member@fitonus.com",
      "displayName": "Alex Member",
      "role": "member",
      "status": "disabled",
      "version": 2,
      "createdAt": "2026-11-05T06:12:00.000Z",
      "updatedAt": "2026-11-05T06:14:00.000Z",
      "disabledAt": "2026-11-05T06:14:00.000Z"
    }
  }
  ```

---

### 3.4 Reactivate User Account
- **Endpoint:** `POST /api/v1/admin/users/:id/reactivate`
- **Access:** Requires permission `users:manage-status`
- **Request Body:**
  ```json
  {
    "reason": "Account ownership verified"
  }
  ```
- **Response Body (200 OK):**
  ```json
  {
    "success": true,
    "message": "User account reactivated.",
    "data": {
      "id": "aeb9d229-1d58-4471-a368-f64e9f963069",
      "email": "member@fitonus.com",
      "displayName": "Alex Member",
      "role": "member",
      "status": "active",
      "version": 3,
      "createdAt": "2026-11-05T06:12:00.000Z",
      "updatedAt": "2026-11-05T06:15:00.000Z",
      "disabledAt": null
    }
  }
  ```

---

## 4. Audit Log Endpoints

### 4.1 List Admin Audit Logs
- **Endpoint:** `GET /api/v1/admin/audit-logs`
- **Access:** Requires permission `admin:audit`
- **Query Parameters:**
  - `page` (optional integer, default `1`)
  - `limit` (optional integer, default `20`)
  - `action` (optional string, e.g. `admin.login`, `user.suspend`, `user.reactivate`)
  - `adminId` (optional UUID)
  - `targetUserId` (optional UUID)
- **Response Body (200 OK):**
  ```json
  {
    "success": true,
    "message": "Success",
    "data": [
      {
        "id": "e4589d81-8b32-47a8-8e6d-2395a1209bca",
        "adminId": "e7b0d911-5369-4e76-8051-b844bf7c65ef",
        "adminEmail": "admin@fitonus.com",
        "adminName": "System Admin",
        "action": "user.suspend",
        "targetUserId": "aeb9d229-1d58-4471-a368-f64e9f963069",
        "targetUserEmail": "member@fitonus.com",
        "details": {
          "previousStatus": "active",
          "newStatus": "disabled",
          "reason": "Suspected unauthorized account takeover"
        },
        "ipAddress": "127.0.0.1",
        "userAgent": "Mozilla/5.0 ...",
        "createdAt": "2026-11-05T06:14:00.000Z"
      }
    ],
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 4,
      "totalPages": 1
    }
  }
  ```

