# FitOnus Web Admin — Authentication & Security Architecture

**Date:** 2026-11-05  
**Author:** Senior Backend & Full-Stack Architect  
**Status:** Complete & Verified  

---

## 1. Authentication Architecture

The FitOnus Web Admin utilizes a multi-layered security model combining strict server-side Role-Based Access Control (RBAC), rate-limiting, audit trails, and dual cookie/bearer authentication.

```
┌──────────────┐                  ┌───────────────────────────────┐
│ Browser / UI │                  │ Express Backend (/admin/auth) │
└──────┬───────┘                  └──────────────┬────────────────┘
       │                                         │
       │ POST /api/v1/admin/auth/login           │
       │ (email, password)                       │
       ├────────────────────────────────────────►│
       │                                         │ 1. Validate Zod schema
       │                                         │ 2. Verify password with Argon2id
       │                                         │ 3. Enforce user.role === 'admin'
       │                                         │    (If member -> 403 Forbidden)
       │                                         │ 4. Issue DB session & JWT
       │                                         │ 5. Insert audit log: 'admin.login'
       │ 200 OK                                  │
       │ Set-Cookie: fitonus_admin_token=...     │
       │ Body: { accessToken, user }             │
       │◄────────────────────────────────────────┤
       │                                         │
       │ Subsequent Requests                     │
       │ Cookie: fitonus_admin_token=...         │
       │ Authorization: Bearer <accessToken>     │
       ├────────────────────────────────────────►│
       │                                         │ 1. authenticate middleware
       │                                         │ 2. requirePermission(...)
       │                                         │ 3. Execute use case
```

---

## 2. Authentication Credentials & Role Verification

### 2.1 The Admin Login Contract
- **Endpoint:** `POST /api/v1/admin/auth/login`
- **Rate Limiting:** Dedicated rate limiter preventing brute-force attacks.
- **Credential Verification:** Uses `Argon2id` password hashing.
- **Mandatory Role Check:**
  ```ts
  if (user.role !== 'admin') {
    throw new AppError(
      'FORBIDDEN',
      'FORBIDDEN',
      'Administrative privileges are required to access this portal.',
    );
  }
  ```
- **Live Verification Outcome:** A member account attempting to log in receives `HTTP 403 Forbidden` (`FORBIDDEN`).

### 2.2 Dual Token & Cookie Defense
1. **HttpOnly Cookie:**
   ```
   Set-Cookie: fitonus_admin_token=<accessToken>; HttpOnly; SameSite=Lax; Path=/; Max-Age=900; [Secure]
   ```
   - Mitigates Cross-Site Scripting (XSS) token exfiltration attacks.
   - Automatically sent by browsers when `credentials: 'include'` is configured.
2. **Bearer Token Fallback:**
   - The access token is also returned in the response payload and maintained in memory/sessionStorage.
   - Allows headless tools, API clients, and proxies to operate seamlessly without cookie headers.

---

## 3. Role-Based Access Control (RBAC) Matrix

Permissions are assigned strictly server-side and checked per route before handler execution:

| Permission | Description | Assigned Roles | Guarded Endpoints |
| :--- | :--- | :--- | :--- |
| `admin:access` | Base portal access & profile inspection | `admin` | `GET /api/v1/admin/auth/me` |
| `admin:stats` | Platform analytics & dashboard KPIs | `admin` | `GET /api/v1/admin/dashboard/stats` |
| `admin:audit` | Security audit log access | `admin` | `GET /api/v1/admin/audit-logs` |
| `users:read` | User directory lookup & detail view | `admin`, `moderator` | `GET /api/v1/admin/users`, `GET /api/v1/admin/users/:id` |
| `users:manage-status` | Suspend / Reactivate member accounts | `admin` | `POST /api/v1/admin/users/:id/suspend`, `POST /api/v1/admin/users/:id/reactivate` |
| `users:assign-role` | Change member/admin role | `admin` | Admin role promotion |

Every route definition explicitly declares its required permission:
```ts
defineRoute({
  method: 'get',
  path: '/dashboard/stats',
  access: { kind: 'permission', permission: 'admin:stats' },
  ...
})
```

---

## 4. Session Revocation & Suspension Defense

When an administrator suspends an account (`POST /api/v1/admin/users/:id/suspend`):
1. User status is set to `disabled` and `disabled_at` timestamp is recorded.
2. `sessions.revokeAllForUser(userId, 'admin_action')` is executed immediately, terminating all active refresh and access tokens across all devices.
3. An audit log is committed with action `user.suspend`, administrator ID, target user ID, IP address, and optional reason.
4. Any immediate subsequent request by the suspended user receives `401 Unauthorized` or `403 Forbidden`.

---

## 5. Self-Suspension Prevention

To prevent catastrophic administrative lockout, `AdminChangeUserStatusUseCase` enforces:
```ts
if (actor.userId === userId && target === 'disabled') {
  throw new AppError(
    'FORBIDDEN',
    'FORBIDDEN',
    'Administrators cannot suspend their own account.',
  );
}
```
Attempting to suspend one's own administrator account is blocked immediately.

