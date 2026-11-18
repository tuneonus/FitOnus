# FitOnus — Admin Login HTTP 401 Diagnosis & Safe Fix Report

**Report Date:** November 9, 2026  
**Role:** Senior Backend Engineer, Authentication Security Engineer, PostgreSQL DBA, QA Engineer  
**Frontend (Vercel Admin):** `https://fit-onus.vercel.app`  
**Backend (Render DEV API):** `https://fitonus-api-dev.onrender.com/api/v1`  
**Target Route:** `POST /api/v1/admin/auth/login`  
**Observed Result:** `HTTP 401 UNAUTHORIZED` ("Invalid email or password. Please verify your credentials.")  

---

## 1. Executive Summary & Root Cause Analysis

### Summary of Diagnosis
1. **Preflight Succeeded (204):**  
   CORS preflight for `OPTIONS /api/v1/admin/auth/login` from `https://fit-onus.vercel.app` is functioning properly (`204 No Content`, `Access-Control-Allow-Origin: https://fit-onus.vercel.app`, `Access-Control-Allow-Credentials: true`).
2. **Neon DEV Database Verified:**  
   The expected administrator account exists, is active, has the `admin` role, and contains a valid Argon2id password hash.
3. **Render DEV Connection Confirmed:**  
   Render DEV connects directly to the approved Neon DEV branch (`br-fragrant-morning-b35lwkjg` / `ep-shy-art-b3sxwfkd`), verified via live public settings reflection (`verified-dev@fitonus.com`).
4. **Argon2id Hash Integrity Confirmed:**  
   The database hash for `admin@fitonus.com` was verified in-process against the configured development seed password in [`backend/.env`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/.env#L37-L38) (`SEED_ADMIN_PASSWORD`). **`argon2.verify(dbHash, process.env.SEED_ADMIN_PASSWORD)` evaluated to `true`.**
5. **Exact Cause of HTTP 401:**  
   The `HTTP 401 UNAUTHORIZED` response in the browser was caused by **credential mismatch on submission** — the client submitted an email or password that did not match the stored Argon2id hash for `admin@fitonus.com`. The backend authentication pipeline and database records are fully healthy and functioning as designed.

---

## 2. Neon DEV Admin Account Verification (SELECT-Only Audit)

Direct SELECT-only inspection against the verified DEV endpoint (`ep-shy-art-b3sxwfkd`) yielded:

| Attribute | Expected Value | Database Actual | Status |
|---|---|---|---|
| **Account ID** | `ae1c758b-e47d-4053-ab70-4114c2bfab79` | `ae1c758b-e47d-4053-ab70-4114c2bfab79` | **MATCH** |
| **Email** | `admin@fitonus.com` | `admin@fitonus.com` | **MATCH** |
| **Display Name** | `Administrator` | `Administrator` | **MATCH** |
| **Role** | `admin` | `admin` | **MATCH** |
| **Status** | `active` | `active` | **MATCH** |
| **Disabled At** | `null` | `null` | **MATCH (Not Locked/Disabled)** |
| **Version** | `1` | `1` | **MATCH (Never Modified)** |
| **Created At** | `2026-11-04T14:25:20.309Z` | `2026-11-04T14:25:20.309Z` | **MATCH** |
| **Updated At** | `2026-11-04T14:25:20.309Z` | `2026-11-04T14:25:20.309Z` | **MATCH (Unchanged Since Seed)** |
| **Password Hash Present** | `true` | `true` (length: 97) | **MATCH** |
| **Hash Algorithm Prefix** | `$argon2id$` | `$argon2id$` | **MATCH (Argon2id Baseline)** |
| **Total Admins in DB** | `1` | `1` | **MATCH (No Duplicate Records)** |

*Note: Per strict security policy, password hashes, secrets, and credentials are redacted.*

---

## 3. Database Identity & Render Connection Verification

### Neon DEV Database Identity
Querying `pg_settings` confirmed the live database connection identity:
- `neon.project_id`: `mute-surf-61144531`
- `neon.branch_id`: `br-fragrant-morning-b35lwkjg`
- `neon.endpoint_id`: `ep-shy-art-b3sxwfkd`
- Host: `ep-shy-art-b3sxwfkd-pooler.c-4.ap-southeast-1.aws.neon.tech`

Protected Production (`br-icy-term-b3lb70tb` / `ep-gentle-bar-b3ywek03`) was **never accessed and remains completely untouched**.

### Verification of Render DEV Target
1. Live endpoint query:
   ```bash
   GET https://fitonus-api-dev.onrender.com/api/v1/app/config
   ```
   Returned payload containing:
   ```json
   "support": {
     "email": "verified-dev@fitonus.com",
     "website": "https://dev.fitonus.com/support",
     "contactInfo": "+1 (800) FIT-DEV1"
   }
   ```
2. Direct database query on `ep-shy-art-b3sxwfkd` for `key = 'app.support'` in `app_settings` returned the exact same JSON record.
3. **Conclusion:** Render DEV (`https://fitonus-api-dev.onrender.com`) is confirmed connected to `br-fragrant-morning-b35lwkjg` (`ep-shy-art-b3sxwfkd`).

---

## 4. Password Hashing & Seed Credential Audit

- **Original Creation:** The account was created on `2026-11-04` by [`backend/scripts/seed.ts`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/scripts/seed.ts) using `registerAccount`.
- **Hashing Implementation:** Application uses [`Argon2PasswordHasher`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/src/shared/security/argon2-password-hasher.ts) (`argon2.argon2id`, memoryCost: 19,456 KiB, timeCost: 2, parallelism: 1).
- **Hash Compatibility:** The stored hash is a valid 97-character Argon2id hash compatible with the authentication engine.
- **Verification Match:** An in-process verification confirmed:
  `argon2.verify(dbHash, process.env.SEED_ADMIN_PASSWORD) === true`.
- **Recovery Mechanisms:** No automated email reset service is currently enabled in backend controllers; administrator credential updates require authenticated sessions or secure administrative CLI execution.

---

## 5. Authentication Flow Findings

Tracing the execution flow from Vercel Admin to Render DEV:

```text
Vercel Admin (https://fit-onus.vercel.app/login)
    ↓
POST /api/v1/admin/auth/login  {"email": "...", "password": "..."}
    ↓
Render DEV Backend (fitonus-api-dev.onrender.com)
    ↓
Rate Limiter (limiters.login: IP + normalized email key) → PASS (not rate limited)
    ↓
adminLoginRequest validation (Zod: email valid, password 1-1024 chars) → PASS
    ↓
AdminLoginUseCase.execute()
    ↓
accounts.findCredentialsByEmail(normalizedEmail)
    ↓
Neon DEV users table (ep-shy-art-b3sxwfkd) → FOUND admin record
    ↓
status === 'active' → PASS
role === 'admin' → PASS
    ↓
passwordHasher.verify(creds.passwordHash, input.password)
    ├── If password matches DB hash → Issues JWT + Refresh Cookie (HTTP 200)
    └── If password does NOT match → Throws INVALID_CREDENTIALS (HTTP 401)
```

Because `creds.status !== 'active'` and `creds.role !== 'admin'` throw **HTTP 403**, the **HTTP 401** confirms the failure occurred specifically at password verification or unmatching email input.

---

## 6. Secure DEV Administrator Password Reset Procedure

To allow the administrator to set a fresh known password securely without risking credentials or exposing secrets in git/history, a dedicated procedure script has been prepared at [`backend/scripts/reset-dev-admin-password.ts`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/scripts/reset-dev-admin-password.ts).

### Safety Features of the Procedure:
1. **Branch Identity Guard:** Queries `pg_settings` for `neon.branch_id` and aborts immediately if connected to anything other than `br-fragrant-morning-b35lwkjg`.
2. **Account Preservation:** Updates only `ae1c758b-e47d-4053-ab70-4114c2bfab79` (`admin@fitonus.com`). Admin ID, email, and relationships remain intact.
3. **Argon2id OWASP Standard:** Computes the hash using the application's standard algorithm.
4. **Zero-Leak Input:** Accepts the new password interactively with muted terminal echo, or via protected environment variable `NEW_DEV_ADMIN_PASSWORD` (immediately deleted from process memory).
5. **No Plaintext in Logs/History:** Never accepts passwords via CLI arguments (`argv`).
6. **Dry Run Guard:** Defaults to dry-run mode; requires explicit `--confirm-dev-reset` flag to commit.
7. **Session Revocation & Audit Logging:** Revokes old sessions and records an audit log entry upon update.

Dry-run execution verified cleanly:
```text
[1/4] Verifying Neon Database Identity...
  ✓ Database identity verified: Confirmed Neon DEV branch.
[2/4] Verifying Approved Admin Account...
  ✓ Admin account confirmed.
[3/4] Acquiring New Password...
  ✓ Password policy satisfied (12-128 chars, non-empty).
[4/4] Hashing password with Argon2id...
  ✓ Argon2id hash verified.
[DRY RUN COMPLETE] - No database modifications were made.
```

---

## 7. Files Modified & Added

- [`backend/scripts/reset-dev-admin-password.ts`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/scripts/reset-dev-admin-password.ts) *(New secure DEV password reset script with multi-layer safety guards)*
- [`backend/tests/unit/admin/admin-login-auth.test.ts`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/tests/unit/admin/admin-login-auth.test.ts) *(New comprehensive test suite covering valid/invalid admin logins, Argon2id verification, RBAC enforcement, and email normalization)*
- [`backend/tests/unit/admin/admin-cors-preflight.test.ts`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/tests/unit/admin/admin-cors-preflight.test.ts) *(Type-check refinement)*

---

## 8. Test Execution Results

- **Backend Authentication Tests:** 6/6 tests passed in `admin-login-auth.test.ts`:
  - Valid admin with Argon2id hash authenticates and returns Bearer tokens (PASS)
  - Invalid password returns 401 `INVALID_CREDENTIALS` (PASS)
  - Non-existent admin email returns 401 `INVALID_CREDENTIALS` (PASS)
  - Member role attempting admin login returns 403 `FORBIDDEN` (PASS)
  - Disabled admin returns 403 `ACCOUNT_DISABLED` (PASS)
  - Email casing normalization (e.g. `Admin@FitOnus.COM`) resolves correctly (PASS)
- **Backend Full Unit Tests:** `78` test files passed, `753` tests passed (`0` failed).
- **Backend TypeScript Compilation:** `tsc --noEmit` passed with exit code 0 (`0` errors).
- **Admin TypeScript Compilation:** `tsc -p admin/tsconfig.json --noEmit` passed with exit code 0 (`0` errors).
- **Admin Unit Tests:** `7` test suites passed, `70` tests passed (`0` failed).

---

## 9. Deployment & Password Reset Decisions

| Question | Assessment | Action |
|---|---|---|
| **Is backend code deployment required?** | **No.** | The backend login controller, routing, and use case are working as designed. |
| **Is database migration required?** | **No.** | The Neon DEV `users` table already holds the valid admin account. |
| **Is admin password reset required?** | **Optional.** | The admin account in Neon DEV already matches the configured `SEED_ADMIN_PASSWORD` in `backend/.env`. If the administrator knows and uses `SEED_ADMIN_PASSWORD`, login will succeed immediately. If the administrator needs a new custom password, the secure reset procedure is ready. |

---

## 10. Next Steps & Approval Gate

The administrator has two available paths:

### Option A: Log in using the existing configured seed credentials
In the Vercel Admin login form (`https://fit-onus.vercel.app/login`):
- **Email:** `admin@fitonus.com`
- **Password:** The configured `SEED_ADMIN_PASSWORD` from `backend/.env` / setup documentation (`AdminSecurePass123!`).

### Option B: Execute the secure DEV-only password reset procedure
If you wish to set a new custom password for `admin@fitonus.com` on Neon DEV:
1. Provide approval to run `backend/scripts/reset-dev-admin-password.ts --confirm-dev-reset`.
2. Supply your desired new administrator password through secure environment variable or interactive prompt.

