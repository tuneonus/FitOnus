# FitOnus Backend Audit — Authentication & Security Architecture Audit

**Document Reference:** `FitOnus/backend/BACKEND_AUDIT/AUTHENTICATION_SECURITY_AUDIT.md`  
**Status:** Complete & Verified Technical Audit  
**Date:** 2026-11-04  
**Auditor:** Senior Backend Architect  
**Classification:** Confidential Technical Assessment

---

## 1. Authentication Architecture & Token Security

The existing FitOnus backend foundation implements a state-of-the-art authentication engine adhering to NIST 800-63B guidelines and modern cryptographic standards [V].

```
                                [Client Request: POST /auth/login]
                                                │
                                                ▼
                                    [LoginUseCase Execution]
                                                │
            +-----------------------------------+-----------------------------------+
            │                                                                       │
            ▼                                                                       ▼
[Argon2id Password Verification]                                            [Session Generation]
- argon2.verify(user.passwordHash, plain)                                   - crypto.randomBytes(64).toString('hex')
- Memory cost: 64 MB (65536)                                                - HMAC-SHA256(refreshToken, HMAC_SECRET)
- Time cost: 3 iterations                                                   - Stored in auth_sessions table
- Parallelism: 4 threads                                                            │
            │                                                                       │
            +-----------------------------------+-----------------------------------+
                                                │
                                                ▼
                                    [Tokens Pair Issued (JSON)]
                    ├── 1. Access Token: HS256 JWT (15-min TTL, carries userId & sessionId)
                    └── 2. Refresh Token: Opaque 128-char hex string (30-day TTL)
```

### 1.1 Access Token Verification: HS256 with Database-Backed Sessions (`ADR 0003`) [V]
- **Algorithm:** Pinned to HS256 using `jose.jwtVerify`.
- **Validation Pipeline:** Every authenticated request executes a two-step verification:
  1. Cryptographic validation of the JWT signature, issuer (`JWT_ISSUER`), audience (`JWT_AUDIENCE`), and expiration timestamp (`exp`).
  2. Immediate lookup in the PostgreSQL `auth_sessions` table to confirm that the session exists and `revoked_at IS NULL`, accompanied by a join on `users` to confirm `status = 'active'`.
- **Fails Closed:** Unlike CareSure's Redis kill-list that fails open when Redis drops, FitOnus's database-backed sessions **fail closed**. If the database is unreachable or the session is revoked, the request is immediately rejected with HTTP 401 Unauthorized.

### 1.2 Refresh Token Rotation & Reuse Detection [V]
- **Single-Use Rotation:** Every call to `POST /api/v1/auth/refresh` rotates the refresh token using atomic Compare-And-Swap (CAS):
  ```sql
  UPDATE auth_sessions 
  SET refresh_token_hash = $new_hash, 
      rotation_count = rotation_count + 1, 
      last_used_at = now()
  WHERE id = $session_id 
    AND refresh_token_hash = $old_hash 
    AND revoked_at IS NULL;
  ```
- **Replay / Reuse Detection:** If an already-rotated or revoked refresh token is submitted, `RefreshTokenUseCase` detects reuse, marks the session revoked with `revoke_reason = 'token_reuse'`, and terminates the session immediately.

---

## 2. Authorization Engine: Code-Defined Permissions & Zero Bypass

FitOnus avoids the major authorization flaws identified in CareSure by implementing a **code-defined, permission-first** authorization model (`src/shared/auth/permissions.ts`, `src/shared/auth/actor.ts`) [V]:

```typescript
export const ROLES = ['admin', 'member'] as const;

export const PERMISSIONS = [
  'users:read',
  'users:create',
  'users:update',
  'users:manage-status',
  'users:assign-role',
] as const;

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  admin: ['users:read', 'users:create', 'users:update', 'users:manage-status', 'users:assign-role'],
  member: [],
};
```

### 2.1 Critical Authorization Safeguards [V]
1. **Zero Role-Name Bypass:** The authorization middleware (`requirePermission`) checks only whether the caller holds the specific required permission. There is no hard-coded `if (role === 'admin') return next()` bypass (which was CareSure's primary privilege escalation vector).
2. **Deny by Default:** In `src/shared/http/route.ts:87-88`, every route definition must declare its access type. If `spec.access.kind === 'permission'`, the router automatically inserts `requirePermission(spec.access.permission)` before request handlers can run.
3. **Resource Ownership Invariant:** For endpoints accessible to members (e.g., `PATCH /users/:id`), the use case calls `assertSelfOrPermission(actor, targetUserId, 'users:update')`, ensuring users can only mutate their own records unless they hold an administrative update grant.

---

## 3. Defense-in-Depth Security Controls

| Security Layer | Implementation Detail | Source File Reference |
|---|---|---|
| **Password Policy** | NIST 800-63B compliant: 12–128 characters, non-consecutive whitespace, rejects ASCII control characters. | `src/shared/security/password-policy.ts:5-24` |
| **HTTP Security Headers** | Helmet 8.3 enforces Strict-Transport-Security (HSTS), X-Content-Type-Options, Frameguard (deny), and Referrer-Policy. | `src/app.ts:39` |
| **CORS Policy** | Whitelist-only; rejects wildcards (`*`); validates origins against an explicit set; requires HTTPS origins in production. | `src/app.ts:13-24` |
| **Body Size Limits** | Enforces a strict 100 KB payload cap (`express.json({ limit: '100kb', strict: true })`) to prevent memory exhaustion. | `src/app.ts:41` |
| **Secret Verification** | Startup validator scans `JWT_ACCESS_SECRET` and `HMAC_SECRET` against a placeholder regex (`/change[-_ ]?me|placeholder|example/i`) and terminates in production if matched. | `src/config/env.ts:106-128` |
| **Key Segregation** | Enforces that `HMAC_SECRET !== JWT_ACCESS_SECRET`, ensuring token signing keys cannot be used for session hashes. | `src/config/env.ts:117-119` |
| **Timing-Safe Compares**| Uses constant-time string comparisons (`crypto.timingSafeEqual`) for all token and signature checks. | `src/shared/security/hmac-keyed-hasher.ts:18` |

---

## 4. Security & Compliance Gaps (Action Items for FitOnus)

While the base kit security architecture is rock-solid, the following gaps exist relative to the full FitOnus product requirements:

1. **No Social Authentication (OAuth 2.0):**  
   FitOnus mobile requires Apple Sign-In and Google Sign-In (`06-authentication.txt`). The current base kit only supports email/password credentials.
2. **In-Memory Rate Limiting (Multi-Instance Vulnerability):**  
   `express-rate-limit` currently uses default in-memory counters (`src/middleware/rate-limit.ts:25-27`). In a scaled deployment on Render with multiple instances, each replica maintains its own counter, multiplying rate limit budgets by the instance count. A shared Redis store (e.g., `rate-limit-redis`) is required for multi-instance deployments.
3. **No Multi-Factor Authentication (MFA / 2FA):**  
   No TOTP (time-based one-time password) or SMS verification is implemented.
4. **No Account Lockout Mechanism:**  
   `users` table lacks a `locked_until` column to temporarily lock accounts after repeated failed password attempts (though rate limiting at 10 attempts per 15 minutes mitigates online attacks).
5. **No Mobile Biometric Auth Hooks:**  
   No endpoints exist to support biometric session exchange (FaceID/TouchID public key registration).

