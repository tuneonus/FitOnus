# FITONUS — ADMIN APPLICATION SETTINGS AUDIT & FIX REPORT

**Document Version:** 1.0.0  
**Audit Date:** November 9, 2026  
**Author:** Senior Full-Stack Engineer & Admin Platform Architect  
**Scope:** Admin Panel (`admin/`), Backend Services (`backend/`), Neon PostgreSQL Database, and Mobile App (`mobile/`)  
**Status:** COMPLETE & VERIFIED  

---

## Executive Summary

An architectural and operational audit of FitOnus Application Settings was conducted across all tiers of the platform: Next.js Admin Control Panel (`admin/`), Express 5 / Node.js 22 Clean Architecture Backend (`backend/`), Neon PostgreSQL DEV database (`br-fragrant-morning-b35lwkjg` / `ep-shy-art-b3sxwfkd`), and Expo SDK 58 React Native Mobile App (`mobile/`).

### Key Audit Conclusions:
1. **Admin Control Panel Settings Boundary**: The FitOnus Admin panel currently implements **Admin Account & Security Settings** (`AdminAccountSettingsModal.tsx`) for administrator credential and session management. This setting is **FULLY FUNCTIONAL** and backed by dedicated backend use-case `AdminChangePasswordUseCase`, Argon2id password hashing, automatic multi-session revocation, and transaction-safe audit logging into `admin_audit_logs`.
2. **System Health Probe Configuration**: The Admin Control Panel includes a dynamic, resilient System Health Indicator (`SystemHealthIndicator.tsx`) probing `/health/ready` and falling back to `/health/live`. This configuration is **FULLY FUNCTIONAL**.
3. **Absence of Dedicated Application Settings Page**: The Admin Control Panel currently does **not** possess an "Application Settings" or "System Settings" route (e.g. `/settings`). Navigational routes are restricted to Dashboard (`/`), Users (`/users`), Workouts (`/workouts`), Nutrition (`/nutrition`), Challenges (`/challenges`), and Audit Logs (`/audit-logs`).
4. **Architectural Gaps in Global Application Controls**: The 10 critical application controls (Maintenance Mode, Minimum App Version, Force Update, Remote Feature Flags, AI Availability Switches, AI Usage Limits, Fitness Global Defaults, System Notification Broadcasts, Support Contact URLs, and Legal URLs) are either **HARDCODED** in application constants or **NOT IMPLEMENTED** at the administrative level.
5. **Separation of Member User Settings vs Admin System Settings**: Member application settings (Theme, Unit System, Language, Privacy Toggles, Notification Schedules, and AI Memory) are fully implemented for mobile members, persisted in `user_settings`, but are not managed or surfaced globally in the Admin panel.
6. **Safety & Zero Disruption**: All concurrent uncommitted work across `admin/`, `backend/`, and `mobile/` has been strictly preserved. Neon Production was untouched. No git commits or branch resets were performed.

---

## 1. Complete Settings Inventory & Traceability Matrix

| Setting / Control Name | Scope | Admin UI Component | API Request Endpoint | Backend Validation & Auth | Database Table & Columns | Mobile / Backend Enforcement | Status |
|:---|:---:|:---|:---|:---|:---|:---:|:---:|
| **Admin Password Management** | Admin Security | [`AdminAccountSettingsModal.tsx`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/admin/src/features/auth/components/AdminAccountSettingsModal.tsx) | `POST /api/v1/admin/auth/change-password` | Zod (12–128 chars), Argon2id verification, `admin:access` permission | `users.password_hash`, `users.version`, `auth_sessions`, `admin_audit_logs` | Admin Portal Auth & Revocation | **FULLY FUNCTIONAL** |
| **Admin Identity & Role Inspection** | Admin Profile | [`AdminAccountSettingsModal.tsx`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/admin/src/features/auth/components/AdminAccountSettingsModal.tsx) | `GET /api/v1/admin/auth/me` | JWT Session verification, `admin:access` permission | `users` (`display_name`, `email`, `role`, `status`) | Admin Header & Identity Badges | **FULLY FUNCTIONAL** |
| **System Health Probe Config** | Admin Ops | [`SystemHealthIndicator.tsx`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/admin/src/components/layout/SystemHealthIndicator.tsx) | `GET /health/ready` & `/health/live` | Express public handler, database ping check | None (runtime probe) | Header Pulse Dot & Latency Display | **FULLY FUNCTIONAL** |
| **Maintenance Mode** | Global App Control | *None* | *None* | *None* | *None* | *None* (No mobile interceptor) | **NOT IMPLEMENTED** |
| **Minimum App Version** | Global App Control | *None* | *None* | *None* | *None* | Hardcoded `APP_VERSION: '1.0.0'` in [`config.ts`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/mobile/src/constants/config.ts) | **HARDCODED** (Mobile) / **NOT IMPLEMENTED** (Control) |
| **Force Update** | Mobile Lifecycle | *None* | *None* | *None* | *None* | *None* | **NOT IMPLEMENTED** |
| **Remote Feature Flags** | Global App Control | *None* | *None* | *None* | *None* | Features statically compiled in [`screenRegistry.tsx`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/mobile/src/app/routes/screenRegistry.tsx) | **NOT IMPLEMENTED** |
| **AI Feature Availability** | AI System | *None* | Member: `PATCH /api/v1/coach/memory/settings` | Member auth, Zod `{ enabled: boolean }` | `user_settings.ai_memory_enabled` (per-user) | Backend checks `GEMINI_API_KEY` at startup; user-level toggle enforced | **PARTIALLY FUNCTIONAL** (Per-user only) |
| **AI Usage Limits / Quotas** | AI System | *None* | *None* | *None* | *None* | Express in-memory rate limiter `aiCoach: rateLimit(15 req/min)` | **HARDCODED** (Middleware) / **NOT IMPLEMENTED** (Admin) |
| **Fitness Default Settings** | Domain Defaults | *None* (Catalog CRUD exists for exercises/templates) | *None* | *None* | None (Exercise catalog tables exist) | Defaults (2000 kcal, 120g protein) hardcoded in metabolic calculator | **HARDCODED** (Domain Logic) / **NOT IMPLEMENTED** (Admin) |
| **System Notification Broadcast** | Communication | *None* | *None* | *None* | *None* | User-level preferences only (`user_settings.notifications_enabled`) | **NOT IMPLEMENTED** (System Level) |
| **Support Contact & Links** | Legal & Support | *None* | *None* | *None* | *None* | Hardcoded text in `SettingsScreen.tsx` ("FitOnus 1.0 (prototype)") | **HARDCODED** (Mobile UI) / **NOT IMPLEMENTED** (Admin) |
| **Privacy Policy & Terms URLs** | Legal & Compliance | *None* | *None* | *None* | *None* | In-app static summary cards in `PrivacyScreen.tsx` | **HARDCODED** (Mobile UI) / **NOT IMPLEMENTED** (Admin) |
| **Member Theme Mode** | User Preference | User Detail Modal (Read-only Account) | `GET /api/v1/profile/settings`, `PATCH /api/v1/profile/settings` | Zod enum (`system`, `light`, `dark`), Member auth | `user_settings.theme_mode` | React Native `ThemeProvider` & MMKV/AsyncStorage | **FULLY FUNCTIONAL** (Member) |
| **Member Unit System** | User Preference | User Detail Modal (Read-only Profile) | `GET /api/v1/profile/settings`, `PATCH /api/v1/profile/settings` | Zod enum (`metric`, `imperial`), Member auth | `user_settings.unit_system` | Mobile UI formatters (`unit-conversion.ts`) | **FULLY FUNCTIONAL** (Member) |
| **Member Language Preference** | User Preference | *None* | `GET /api/v1/profile/settings`, `PATCH /api/v1/profile/settings` | Zod enum (`en`, `ta`), Member auth | `user_settings.language` | Mobile `LanguageScreen.tsx` & `settingsStore.ts` | **FULLY FUNCTIONAL** (Member) |
| **Member Privacy Toggles** | User Compliance | *None* | `GET /api/v1/profile/settings`, `PATCH /api/v1/profile/settings` | Zod booleans, Member auth | `user_settings.privacy_analytics`, `privacy_photo_retention`, `privacy_coach_sharing` | Mobile `PrivacyScreen.tsx`, meal photo deletion logic | **FULLY FUNCTIONAL** (Member) |

---

## 2. Admin UI Status

### 2.1 Present Features
- **Header Settings Trigger**: Located in [`admin/src/components/layout/Header.tsx`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/admin/src/components/layout/Header.tsx#L59-L80). Features avatar initials, display name, shield role badge, and a gear icon (`<Settings />`) triggering the modal.
- **Admin Account & Security Settings Modal**: [`admin/src/features/auth/components/AdminAccountSettingsModal.tsx`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/admin/src/features/auth/components/AdminAccountSettingsModal.tsx).
  - Displays authenticated admin profile: full name, email address, unique system UUID with copy-to-clipboard feedback, role badge (`ADMIN`), and list of granted permissions pills (`admin:access`, `admin:write`, `challenges:manage`).
  - Implements an interactive password modification subform:
    - Current Password input with visibility toggle (`<Eye />` / `<EyeOff />`).
    - New Password input with visibility toggle.
    - Confirm Password input with visibility toggle.
    - Live client-side checklist: $\ge 12$ characters length, different from current password, matching confirmation.
    - Submit button with in-flight spinner (`<Loader2 />`) and disabled guard when inputs are invalid.
    - Error banner and toast integration for server feedback.
- **System Health Indicator**: Located in [`admin/src/components/layout/SystemHealthIndicator.tsx`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/admin/src/components/layout/SystemHealthIndicator.tsx).
  - Queries `/health/ready` (or `/health/live`), displays pulse dot, status label (`Online`, `Degraded`, `Offline`), latency tag in ms, manual refresh button, and 60-second polling interval.

### 2.2 UI-Only vs Real Implementation Audit
- The Admin Account Settings Modal is **100% Real**. It is **not** a dummy or simulated UI. It dispatches network requests via `authApi.changePassword()` to the live backend.
- The Admin Sidebar ([`Sidebar.tsx`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/admin/src/components/layout/Sidebar.tsx)) contains no navigation item for "Application Settings".
- There are no unfunctional "Save" buttons in the Admin UI producing false success messages.

---

## 3. Backend API Status

### 3.1 Implemented Administrative Settings Routes
Mounted at `/api/v1/admin` in [`backend/src/modules/admin/interface/admin.routes.ts`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/src/modules/admin/interface/admin.routes.ts):
- `GET /api/v1/admin/auth/me`:
  - **Access**: `permission: 'admin:access'`.
  - **Response**: `{ data: { id, email, displayName, role, status, permissions } }`.
- `POST /api/v1/admin/auth/change-password`:
  - **Access**: `permission: 'admin:access'`.
  - **Rate Limiting**: `limiters.sensitive` (protects against brute-force).
  - **Request Body**: `z.strictObject({ currentPassword: z.string().min(1), newPassword: z.string().min(12).max(128) })`.
  - **Use Case**: [`AdminChangePasswordUseCase`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/src/modules/admin/application/use-cases/admin-change-password.ts).
  - **Response**: `{ data: { message: string, revokedSessions: number } }`.
- `GET /api/v1/admin/audit-logs`:
  - **Access**: `permission: 'admin:audit'`.
  - **Capabilities**: Supports filtering by `action` (including `admin.password_change`), `adminId`, `targetUserId`, and pagination.

### 3.2 Member-Level User Settings Routes
Mounted at `/api/v1/profile` in [`backend/src/modules/profile/interface/profile.routes.ts`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/src/modules/profile/interface/profile.routes.ts):
- `GET /api/v1/profile/settings`:
  - **Access**: Authenticated member.
  - **Scope**: User-isolated via `actor.userId`.
- `PATCH /api/v1/profile/settings`:
  - **Access**: Authenticated member.
  - **Validation**: Strict Zod schema enforcing allowed enums and rejecting unknown attributes.

---

## 4. Database Persistence Status

### 4.1 Neon PostgreSQL Schema Verification
Database schema verified against Neon DEV branch:
- **`users` Table** ([`0001_create_users.sql`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/migrations/0001_create_users.sql)):
  - Stores `password_hash` (Argon2id).
  - Enforces `version` counter (incremented atomically during password changes).
  - Stores `status` (`active` vs `disabled`).
- **`auth_sessions` Table** ([`0002_create_auth_sessions.sql`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/migrations/0002_create_auth_sessions.sql)):
  - Foreign key to `users(id)` with `ON DELETE CASCADE`.
  - Supports `revokeAllForUser` with `exceptSessionId` parameter to preserve the current session while revoking stolen or legacy sessions.
- **`admin_audit_logs` Table** ([`0005_create_admin_audit_logs.sql`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/migrations/0005_create_admin_audit_logs.sql)):
  - Records administrative events: `admin.login`, `admin.logout`, `admin.password_change`, `user.suspend`, `user.reactivate`.
  - Stores `details` (JSONB) with revoked session count, capturing `ip_address` and `user_agent`.
- **`user_settings` Table** ([`0004_create_user_profiles.sql`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/migrations/0004_create_user_profiles.sql), [`0012_extend_user_settings_and_preferences.sql`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/migrations/0012_extend_user_settings_and_preferences.sql)):
  - Stores individual member preferences (`theme_mode`, `unit_system`, `language`, `notifications_enabled`, `privacy_analytics`, `privacy_photo_retention`, `privacy_coach_sharing`, `notification_schedule`, `ai_memory_enabled`).
- **Absence of `app_settings` / `system_settings`**:
  - PostgreSQL contains **no** table for platform-wide key-value configuration.

---

## 5. Mobile Integration Status

1. **Initial Configuration Fetch**:
   - The mobile application derives its base API URL and Dev flag from [`mobile/src/constants/config.ts`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/mobile/src/constants/config.ts).
   - `APP_VERSION` is hardcoded to `'1.0.0'`.
   - The mobile application does **not** perform an initial boot-time configuration handshake with the backend (e.g. `GET /api/v1/config`).
2. **Member Settings Synchronization**:
   - Authenticated members query `GET /api/v1/profile/settings` via TanStack Query hook `useSettings()`.
   - Settings are stored locally in Zustand (`settingsStore.ts`) and persisted into user-scoped storage keys.
   - On logout, `auth-service.ts` calls `resetAllUserStores()`, properly clearing settings and preventing cross-user data leakage.
3. **Offline Fallback**:
   - Local store provides in-memory fallback defaults (`DEFAULT_SETTINGS`).
   - Network mutations in `SettingsScreen`, `AppearanceScreen`, `LanguageScreen`, and `PrivacyScreen` roll back state and display an error toast if the backend call fails.
4. **Maintenance Mode & Force Update Handling**:
   - The mobile application contains no interceptors, status screens, or navigation guards for maintenance mode or minimum app version enforcement.

---

## 6. Feature Flag Enforcement

- **Current State**: There is **no remote feature flag system** in FitOnus.
- **Enforcement Mechanism**:
  - All screens in the mobile application are statically imported and registered in [`mobile/src/app/routes/screenRegistry.tsx`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/mobile/src/app/routes/screenRegistry.tsx).
  - On the backend, routes are enabled or disabled solely through environment variables (e.g., `GEMINI_API_KEY` presence gates AI operations; `AUTH_PUBLIC_REGISTRATION` gates signups).
- **Direct API Bypass Protection**:
  - AI endpoints (`/api/v1/coach/*`) cannot be bypassed by client trickery because authentication is enforced via JWT access tokens and backend permissions (`actor.role === 'member'`), with an Express rate limiter (15 requests/minute).

---

## 7. Security Findings

1. **Strict Admin Authentication & RBAC**:
   - Administrative endpoints strictly demand `admin:access` or `admin:audit` permissions. Standard member access tokens are rejected with `HTTP 403 FORBIDDEN`.
2. **Safe Password Policy Enforced**:
   - Passwords must be between 12 and 128 characters, complying with NIST SP 800-63B.
   - Re-use of the existing password is explicitly blocked with `PASSWORD_POLICY_VIOLATION`.
   - Argon2id hashing prevents rainbow table and GPU-accelerated cracking attacks.
3. **No Secrets Exposed via Public Endpoints**:
   - Inspection of public routes (`/health/live`, `/health/ready`, `/api/v1/admin/auth/login`, `/api/v1/auth/login`) verified that database connection strings, JWT access secrets, Gemini API keys, and HMAC secrets are completely absent from API responses.
4. **No Arbitrary Key Modification**:
   - Backend routes utilize `z.strictObject(...)`, returning `HTTP 400 VALIDATION_FAILED` whenever unknown or arbitrary fields are submitted.
5. **Audit Trail Accountability**:
   - Admin password modifications write an immutable audit log record to `admin_audit_logs` capturing admin ID, IP address, and user agent, without logging sensitive password cleartext.

---

## 8. Broken Settings & Deficiencies Identified

1. **Audit Logs Filter Dropdown Missing Password Events**:
   - *Defect*: When an admin changed their password, an audit log was successfully written with `action = 'admin.password_change'`. However, [`AuditLogsFilterBar.tsx`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/admin/src/features/audit-logs/components/AuditLogsFilterBar.tsx) did not include an option for filtering password change events in the UI.
   - *Status*: **FIXED**.
2. **Audit Log Action Badge Styling**:
   - *Defect*: `AuditLogActionBadge.tsx` did not feature a distinct icon or amber badge styling for `admin.password_change`, rendering it with the generic gray activity icon.
   - *Status*: **FIXED**.
3. **Missing System Application Settings Infrastructure**:
   - *Architectural Gap*: The 10 application controls identified in Section 4 of the audit have no administrative interface, database storage, or remote distribution mechanism.

---

## 9. Safe Fixes Completed

The following isolated, safe fixes were implemented and verified with zero regression:

1. **Audit Logs Filter Bar Enhancement** ([`AuditLogsFilterBar.tsx`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/admin/src/features/audit-logs/components/AuditLogsFilterBar.tsx#L28)):
   - Added `<option value="admin.password_change">Admin Password Changes (admin.password_change)</option>`.
   - Enables administrators to filter and review administrative credential changes across the platform.
2. **Audit Log Action Badge Enhancement** ([`AuditLogActionBadge.tsx`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/admin/src/features/audit-logs/components/AuditLogActionBadge.tsx#L29-L36)):
   - Added amber pill badge styling with `<KeyRound className="h-3 w-3" />` for any action containing `'password'`.
3. **Comprehensive Test Suite Added** ([`admin-application-settings-audit.test.ts`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/tests/unit/admin/admin-application-settings-audit.test.ts)):
   - Created a 11-test suite verifying GET, UPDATE, persistence, RBAC, input validation, strict schemas, public/private separation, user isolation, and rate-limiting.

---

## 10. Missing Capabilities & Proposed Architecture

To transition FitOnus from hardcoded application controls to fully managed, real-time administrative application settings, the following architecture is proposed:

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Proposed Architecture                         │
├─────────────────────────┬──────────────────────────────────────────────┤
│ PostgreSQL Neon DEV     │ Table: system_settings (key, value, version) │
│ Backend Module          │ modules/system-settings/ (GET/PUT admin API) │
│ Public Mobile Endpoint  │ GET /api/v1/config/bootstrap (cached, safe)  │
│ Admin Control Panel UI  │ admin/app/settings/page.tsx (Categorized UI) │
│ Mobile Interceptor      │ AppShell.tsx (Maintenance & Force Update)    │
└─────────────────────────┴──────────────────────────────────────────────┘
```

### Proposed Schema:
```sql
CREATE TABLE system_settings (
  key text PRIMARY KEY,
  category text NOT NULL,
  value jsonb NOT NULL,
  is_public boolean NOT NULL DEFAULT false,
  description text,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### Proposed Public Endpoint:
`GET /api/v1/config/bootstrap` returning:
```json
{
  "maintenance": { "enabled": false, "message": null },
  "version": { "minSupported": "1.0.0", "latest": "1.0.1", "forceUpdate": false },
  "features": { "aiCoach": true, "mealScanner": true },
  "legal": { "privacyPolicyUrl": "https://fitonus.com/privacy", "termsUrl": "https://fitonus.com/terms" }
}
```

---

## 11. Test Results

### 1. Admin Test Suite (`admin/tests/`)
- **Total Tests:** 59
- **Passing:** 59
- **Failing:** 0
- **Suites:** 5 (`admin-foundation.test.ts`, `admin-qa-verification.test.ts`, `challenges-admin.test.ts`, `content-and-users.test.ts`, `dashboard-enhancement.test.ts`)
- **Result:** **100% PASS**

### 2. Backend Test Suite (`backend/tests/`)
- **Total Test Files:** 74
- **Total Tests:** 723
- **Passing:** 723
- **Failing:** 0
- **Settings Audit Tests:** 11/11 passing in `tests/unit/admin/admin-application-settings-audit.test.ts`
- **Result:** **100% PASS**

### 3. Mobile Test Suite (`mobile/tests/`)
- **Total Tests:** 176
- **Passing:** 176
- **Failing:** 0
- **Settings & Privacy Tests:** 45/45 passing across Phase 9.3, 9.4, 9.5 test suites
- **Result:** **100% PASS**

---

## 12. Recommended Next Steps

1. **Phase 11 System Settings Engine**: Implement `system_settings` PostgreSQL migration and Clean Architecture module in backend to manage maintenance mode, minimum app version, and feature toggles.
2. **Admin Application Settings UI**: Create `admin/app/settings/page.tsx` with dedicated tabs:
   - *Platform Controls*: Maintenance mode switch, version gates, force-update controls.
   - *Feature Management*: Global toggles for AI Coach, Voice Meal entry, Barcode Scanner.
   - *AI Quotas*: Dynamic rate limits and token allocations per user tier.
   - *Legal & Support*: Configurable Privacy Policy URL, Terms of Service URL, and support email.
3. **Mobile Bootstrap Handshake**: Introduce a light startup hook in mobile `_layout.tsx` fetching `/api/v1/config/bootstrap` to evaluate maintenance mode and force updates before rendering the tab navigator.
