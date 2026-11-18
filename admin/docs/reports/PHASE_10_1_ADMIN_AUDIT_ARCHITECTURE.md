# FITONUS — PHASE 10.1 ARCHITECTURE & AUDIT REPORT
## Admin Panel Audit, Requirements Analysis & Architecture Planning

**Document Version:** 1.0.0  
**Date:** 2026-11-07  
**Module:** Admin Panel (`admin/`) & Backend Admin APIs (`backend/src/modules/admin/`, `workouts/`, `nutrition/`, `challenges/`)  
**Author:** Senior Full-Stack Architect  
**Status:** COMPLETE (Planning & Audit Only — Zero Code Changes)  

---

## 1. Executive Summary

Phase 10 focuses on the stabilization, enhancement, and enterprise-grade hardening of the **FitOnus Admin Control Panel**. The admin application is a Next.js (Turbopack) web application deployed on Vercel, interfacing with the FitOnus Node.js/Express 5 Clean Architecture backend and Neon PostgreSQL database.

### Key Audit Findings:
1. **Solid Pre-Existing Architecture**: Contrary to initial assumptions, the admin panel already possesses complete, modular frontend feature directories (`features/auth`, `dashboard`, `users`, `profiles`, `workouts`, `nutrition`, `challenges`, `audit-logs`).
2. **100% Real API Integration**: **Zero screens are powered by hardcoded mock data arrays**. All 6 operational admin views (`/`, `/users`, `/workouts`, `/nutrition`, `/challenges`, `/audit-logs`) query actual backend REST endpoints mounted under `/api/v1/admin/`.
3. **Backend API Readiness**: The backend already implements 27 dedicated administrative endpoints across 4 distinct domain modules (`admin`, `workouts`, `nutrition`, `challenges`), complete with transactional audit logging into `admin_audit_logs`.
4. **Code Quality & Build Status**: Next.js production build succeeds with exit code 0 (`npm --prefix admin run build`). However, ESLint identifies 4 errors related to React 19 `react-hooks/set-state-in-effect` rules and explicit `any` typings that must be remediated in Phase 10.2.
5. **Key Functional Gaps Identified**:
   - Absence of an Admin Account / Settings screen (admins cannot change their own password in the admin portal).
   - Incomplete Gamification UI (reward badges in challenges are text UUIDs rather than a catalog picker; no system badges management view).
   - Fragmented notification feedback (some screens use local banners, others use inline errors).
   - Cross-domain metrics (workouts and nutrition) exist in sub-modules but are not aggregated onto the main Dashboard overview.

---

## 2. Existing Admin Architecture

### 2.1 Technology Stack
- **Framework**: Next.js 16.2.10 (Turbopack App Router)
- **UI & Styling**: React 19.2.4, Tailwind CSS v4, Lucide React icons
- **State & Data Fetching**: React Context (`AuthContext`), custom hooks per feature (`useUsers`, `useExercises`, `useNutritionFoods`, `useChallenges`, `useAuditLogs`), native `fetch` via centralized `apiClient`.
- **Backend Communication**: RESTful JSON over HTTPS, credentials included via HttpOnly session cookies (`fitonus_admin_token`) with SameSite=Lax.
- **Anti-CSRF & CORS**: Custom header `X-Panel-Id: fitonus-admin` enforces CORS preflight verification.

### 2.2 Directory Layout
```
admin/
├── app/                           # Next.js App Router Pages
│   ├── layout.tsx                 # Root layout with AuthProvider & metadata
│   ├── page.tsx                   # Dashboard overview (/)
│   ├── login/page.tsx             # Administrator authentication (/login)
│   ├── users/page.tsx             # User directory & suspension (/users)
│   ├── workouts/page.tsx          # Exercise & template management (/workouts)
│   ├── nutrition/page.tsx         # Verified food catalog (/nutrition)
│   ├── challenges/page.tsx        # Challenges & gamification (/challenges)
│   └── audit-logs/page.tsx        # Immutable security audit trail (/audit-logs)
├── src/
│   ├── components/                # Shared layout & atomic UI primitives
│   │   ├── layout/                # AdminLayout, Header, Sidebar
│   │   └── ui/                    # Badge, Modal, StatsCard, LoadingSpinner, EmptyState
│   ├── features/                  # Domain-Driven feature modules
│   │   ├── auth/                  # Admin auth context, login form, types, API
│   │   ├── dashboard/             # Stats hooks, funnel cards, registration charts
│   │   ├── users/                 # User table, filter bar, status modals, API
│   │   ├── profiles/              # User detail modal, support profile API
│   │   ├── workouts/              # Exercises & templates tables, modals, API
│   │   ├── nutrition/             # Food catalog table, create/verify modals, API
│   │   ├── challenges/            # Challenges table, publish/archive modals, API
│   │   └── audit-logs/            # Audit logs table, action badges, detail modal
│   ├── lib/                       # Centralized apiClient, ApiError, API_BASE
│   └── types/                     # Shared ApiResponse, PaginationMeta
└── tests/                         # Node.js contract & logic integration tests
```

---

## 3. Complete Route & Screen Inventory

| Route | Page Component | Feature View | Purpose | Access Control |
|:---|:---|:---|:---|:---|
| `/login` | `admin/app/login/page.tsx` | `LoginForm.tsx` | Administrator credential entry & cookie issuance | Public (Rate-limited) |
| `/` | `admin/app/page.tsx` | `DashboardView.tsx` | Platform KPIs, user growth trends, onboarding funnel | Authenticated (`admin:stats`) |
| `/users` | `admin/app/users/page.tsx` | `UsersView.tsx` | Directory search, filter, detail inspection, suspend/reactivate | Authenticated (`users:read`, `users:manage-status`) |
| `/workouts` | `admin/app/workouts/page.tsx` | `WorkoutsAdminView.tsx` | Exercise library CRUD, system workout routines, platform volume stats | Authenticated (`admin:access`) |
| `/nutrition` | `admin/app/nutrition/page.tsx` | `NutritionAdminView.tsx` | Food catalog CRUD, verification gating, meal/water analytics | Authenticated (`admin:access`) |
| `/challenges` | `admin/app/challenges/page.tsx` | `ChallengesAdminView.tsx` | Challenge definitions CRUD, draft/publish/archive state machine | Authenticated (`admin:access`) |
| `/audit-logs` | `admin/app/audit-logs/page.tsx` | `AuditLogsView.tsx` | Immutable audit log table, action filters, JSON event inspector | Authenticated (`admin:audit`) |

---

## 4. Real API vs. Mock Data Matrix

| Screen / Feature | Data Source | Endpoint Used | Status | Notes |
|:---|:---:|:---|:---:|:---|
| **Admin Login** | Real API | `POST /api/v1/admin/auth/login` | **REAL** | Authenticates admin credentials, sets HttpOnly cookie |
| **Auth Session Check** | Real API | `GET /api/v1/admin/auth/me` | **REAL** | Validates session on route load and refreshes user |
| **Admin Logout** | Real API | `POST /api/v1/admin/auth/logout` | **REAL** | Revokes session in database and clears cookies |
| **Dashboard Metrics** | Real API | `GET /api/v1/admin/dashboard/stats` | **REAL** | Live queries on `users` table for active/onboarding/trend |
| **Recent Users List** | Real API | `GET /api/v1/admin/dashboard/stats` | **REAL** | Returns top 10 most recent user registrations |
| **User Directory** | Real API | `GET /api/v1/admin/users` | **REAL** | Live search, pagination, status, role, onboarding filters |
| **User Detail Modal** | Real API | `GET /api/v1/admin/users/:id` | **REAL** | Fetches user, profile biometrics, targets, and settings |
| **Suspend User** | Real API | `POST /api/v1/admin/users/:id/suspend` | **REAL** | Updates status to disabled, revokes sessions, logs audit |
| **Reactivate User** | Real API | `POST /api/v1/admin/users/:id/reactivate` | **REAL** | Updates status to active, logs audit |
| **Exercises Library** | Real API | `GET /api/v1/admin/workouts/exercises` | **REAL** | Live search, muscle, equipment, category filters |
| **Exercise CRUD** | Real API | `POST/PUT/DELETE /api/v1/admin/workouts/exercises` | **REAL** | Creates/updates/soft-deletes exercises in database |
| **Workout Templates** | Real API | `GET/POST/PUT/DELETE /api/v1/admin/workouts/templates`| **REAL** | Full CRUD for system workout routines |
| **Workout Stats** | Real API | `GET /api/v1/admin/workouts/stats` | **REAL** | Live database aggregates on workouts and volume |
| **Food Catalog** | Real API | `GET /api/v1/admin/nutrition/foods` | **REAL** | Queries catalog with data source and verify filters |
| **Food CRUD & Verify**| Real API | `POST/PUT/DELETE/VERIFY /api/v1/admin/nutrition/foods` | **REAL** | Full food catalog management with privacy protections |
| **Nutrition Stats** | Real API | `GET /api/v1/admin/nutrition/stats` | **REAL** | Live database aggregates on foods, meals, water |
| **Challenges Table** | Real API | `GET /api/v1/admin/challenges` | **REAL** | Live challenge definitions with cadence/status filters |
| **Challenge CRUD** | Real API | `POST/PATCH/PUBLISH/ARCHIVE /api/v1/admin/challenges` | **REAL** | Challenge lifecycle state machine |
| **Audit Logs Table** | Real API | `GET /api/v1/admin/audit-logs` | **REAL** | Paginated audit trail with action filtering |

**Matrix Conclusion**: The admin portal contains **zero mock data arrays**. All screens interact with real database-backed APIs.

---

## 5. Backend Endpoint Coverage & Gap Analysis

### 5.1 Existing Admin Endpoints (27 Endpoints Verified)

```
[Admin Core]
POST   /api/v1/admin/auth/login                   (Public, Rate-limited)
GET    /api/v1/admin/auth/me                      (admin:access)
POST   /api/v1/admin/auth/logout                  (authenticated)
GET    /api/v1/admin/dashboard/stats              (admin:stats)
GET    /api/v1/admin/users                        (users:read, Paginated)
GET    /api/v1/admin/users/:id                    (users:read)
POST   /api/v1/admin/users/:id/suspend            (users:manage-status)
POST   /api/v1/admin/users/:id/reactivate         (users:manage-status)
GET    /api/v1/admin/audit-logs                   (admin:audit, Paginated)

[Admin Workouts]
GET    /api/v1/admin/workouts/exercises           (admin:access, Paginated)
POST   /api/v1/admin/workouts/exercises           (admin:access)
PUT    /api/v1/admin/workouts/exercises/:id       (admin:access)
DELETE /api/v1/admin/workouts/exercises/:id       (admin:access)
GET    /api/v1/admin/workouts/templates           (admin:access, Paginated)
POST   /api/v1/admin/workouts/templates           (admin:access)
PUT    /api/v1/admin/workouts/templates/:id       (admin:access)
DELETE /api/v1/admin/workouts/templates/:id       (admin:access)
GET    /api/v1/admin/workouts/stats               (admin:access)

[Admin Nutrition]
GET    /api/v1/admin/nutrition/stats              (admin:access)
GET    /api/v1/admin/nutrition/foods              (admin:access, Paginated)
POST   /api/v1/admin/nutrition/foods              (admin:access)
GET    /api/v1/admin/nutrition/foods/:id          (admin:access)
PUT    /api/v1/admin/nutrition/foods/:id          (admin:access)
DELETE /api/v1/admin/nutrition/foods/:id          (admin:access)
POST   /api/v1/admin/nutrition/foods/:id/verify   (admin:access)

[Admin Challenges]
GET    /api/v1/admin/challenges/                  (admin:access)
POST   /api/v1/admin/challenges/                  (admin:access)
GET    /api/v1/admin/challenges/:challengeId      (admin:access)
PATCH  /api/v1/admin/challenges/:challengeId      (admin:access)
POST   /api/v1/admin/challenges/:challengeId/publish (admin:access)
POST   /api/v1/admin/challenges/:challengeId/archive (admin:access)
```

### 5.2 Identified Backend API Gaps
1. **Admin Password Management**: `POST /api/v1/auth/change-password` exists for mobile JWTs, but there is no dedicated admin endpoint or admin UI form to change admin credentials using session cookies.
2. **Badges Administration**: Badges are created and awarded via Phase 7 gamification, but there are no endpoints for administrators to browse, create, or update system badge definitions (`GET/POST /api/v1/admin/badges`).
3. **User Activity Summary**: `GET /api/v1/admin/users/:id` returns static profile biometrics, but does not include aggregate activity stats (e.g., total workouts completed, total meals logged, current weight, streak count).
4. **Session Termination**: Admin cannot terminate specific active user sessions without performing a full account suspension.
5. **System Health Check**: `GET /health` exists at the root, but no authenticated admin status check endpoint exposes PostgreSQL connection pool latency or server memory utilization.

---

## 6. Authentication & Authorization Assessment

### 6.1 Authentication Architecture
- Admin login validates against the same `users` database table, enforcing `role === 'admin'`. Non-admin credentials attempting admin login receive HTTP 403 `INSUFFICIENT_PERMISSIONS`.
- Successful login issues:
  - An HttpOnly, Secure, SameSite=Lax cookie: `fitonus_admin_token` (7-day validity).
  - A short-lived JWT access token in the response body.
- The `apiClient` includes credentials on every fetch request, allowing seamless server-side cookie authentication without storing raw tokens in `localStorage`.

### 6.2 Authorization Findings & Security Risks
1. **Coarse-Grained RBAC**:
   - The platform defines two roles: `'admin'` and `'member'`.
   - Every user with role `'admin'` holds all permissions (`admin:access`, `admin:audit`, `admin:stats`, `users:read`, `users:manage-status`).
   - *Risk*: A support staff member who only needs to inspect user profiles also holds permissions to delete system exercises, archive challenges, and suspend users.
   - *Recommendation for Phase 10*: Retain the dual-role model for simplicity, but prepare the schema for future sub-roles (`superadmin`, `support`, `moderator`).
2. **CSRF Mitigation**:
   - The admin panel relies on `SameSite=Lax` cookies combined with custom header `X-Panel-Id: fitonus-admin`.
   - Because standard HTML forms and cross-site scripts cannot send custom headers without triggering CORS preflights, this provides effective anti-CSRF protection.

---

## 7. Dashboard Assessment

### Strengths
- Real-time KPIs with percentage calculations against total accounts.
- Visual onboarding completion funnel.
- 30-day interactive SVG/CSS registration trend chart.
- Quick navigation link from recent users to full directory.

### Deficiencies & Recommended Phase 10 Improvements
1. **Siloed Domain Metrics**: While User growth is well-represented, Workout activity (volume lifted, sessions completed) and Nutrition tracking (meals and water logged) are invisible on the main dashboard.
2. **Static Timeframes**: Registration charts only show 30-day historical data. Adding a 7d / 30d / 90d toggle would enhance operational visibility.
3. **Quick Action Hub**: Administrators lack shortcut buttons to trigger common operations (e.g. "Add Exercise", "New Challenge", "Export Audit Trail").

---

## 8. User Management Assessment

### Strengths
- Fast paginated table with real-time text search (email and name).
- Multi-dimensional filtering by status (`active`, `disabled`), role (`member`, `admin`), and onboarding status.
- Modal inspection of user biometrics, targets, and account timestamps.
- Audit-logged account suspension and reactivation with mandatory reason inputs.

### Deficiencies & Recommended Phase 10 Improvements
1. **Missing Activity History**: Support staff investigating user complaints cannot view whether the user has logged workouts, nutrition entries, or weight logs without querying the database directly.
2. **Session Eviction**: Add a "Revoke Sessions" action allowing admins to log a user out of all devices without disabling their account.
3. **Directory Export**: Add a "Export to CSV" button for filtered user lists to aid administrative compliance.

---

## 9. Content Management Assessment (Workouts & Nutrition)

### Workouts & Exercises
- **Strengths**: Comprehensive exercise modal with muscle targeting, equipment, difficulty, instructions, tips, and soft deletion. Reusable workout templates with multi-exercise picker, sets, reps, and RPE targets.
- **Improvements**:
  - Exercise media preview: Display video/GIF thumbnail previews inside the modal to prevent broken video URLs.
  - Template duplicate: Add a "Clone as Template" button to accelerate creating routine variations.

### Nutrition & Food Catalog
- **Strengths**: Industrial-grade food catalog editor supporting serving units, weight/volume density, macronutrients, and micronutrients (sugar, sodium, cholesterol).
- **Privacy Gating**: Explicit check prevents promoting private custom foods to the global catalog without user consent.
- **Improvements**:
  - Quick Verification: Add a 1-click "Verify" button on trusted rows directly in the catalog table.
  - Barcode Lookup: Add barcode search to quickly locate UPC/EAN products.

---

## 10. Challenges & Gamification Management Assessment

### Strengths
- Full challenge definition state machine: `draft` $\rightarrow$ `published` $\rightarrow$ `archived`.
- Comprehensive metric types: workout counts, duration, volume, habits, water intake, streaks.
- 15 automated contract tests in `admin/tests/challenges-admin.test.ts`.

### Deficiencies & Recommended Phase 10 Improvements
1. **Reward Badge Input**: `rewardBadgeId` is currently a raw string input. Administrators have no way to look up existing badges. Needs a dropdown or system badge picker.
2. **System Badges Catalog**: There is currently no admin interface to create, edit, or inspect system badges (icons, tiers, point values).
3. **Occurrence Monitoring**: Once a challenge is published, occurrences are generated automatically by cron/worker. The admin currently cannot inspect active occurrences or view enrolled user counts.

---

## 11. UI/UX Assessment & ESLint Quality Audit

### Build Status
- `npm --prefix admin run build` compiles with **exit code 0**. Turbopack generates all 7 static routes cleanly.

### ESLint Issues Found (`npm --prefix admin run lint`):
1. **`admin/src/features/challenges/components/ChallengeModal.tsx:70:7`**:
   - `error: Calling setState synchronously within an effect can trigger cascading renders (react-hooks/set-state-in-effect)`.
2. **`admin/src/features/challenges/hooks/useChallenges.ts:40:5`**:
   - `error: Avoid calling setState() directly within an effect (react-hooks/set-state-in-effect)`.
3. **`admin/tests/challenges-admin.test.ts:250:19 & 258:13`**:
   - `error: Unexpected any. Specify a different type (@typescript-eslint/no-explicit-any)`.
4. **Unused Imports**: 4 warnings in `api.ts`, `ChallengeModal.tsx`, and `ChallengesAdminView.tsx`.

*Remediation Plan*: These lint errors must be resolved in Phase 10.2 to restore clean CI gate status.

---

## 12. Security & Performance Risks

| Risk Area | Severity | Impact | Mitigation Plan |
|:---|:---:|:---|:---|
| **No Admin Password Change UI** | Medium | Admin cannot rotate compromised passwords from panel | Build admin profile/password modal in Phase 10.2 |
| **Coarse Admin Privileges** | Low | All admins hold full destructive powers | Keep audit logs immutable; prepare role expansion |
| **Large Table Renders** | Low | Large catalogs (1,000+ foods) could degrade DOM | Existing backend pagination (limit 25/50) mitigates this |
| **Missing Rate Limit on Admin Endpoints** | Medium | Scraping or brute-force user queries | Backend `rateLimiters` already applied on login; apply to sensitive mutation routes |

---

## 13. Phase 10 Recommended Scope

Based on the audit, Phase 10 should focus on **functional polish, cross-domain observability, security hardening, and code reliability** rather than ground-up rewrites.

### Core Work Packages:
1. **Phase 10.2: Admin Foundation, Security & Code Quality**
   - Fix all 4 ESLint errors and 4 warnings to restore clean linting.
   - Add Admin Account Settings modal (admin password change).
   - Add System Health status indicator (`GET /health`) in Header.
   - Standardize Toast notification system across all views.
2. **Phase 10.3: Unified Dashboard & Cross-Domain Observability**
   - Incorporate Workout and Nutrition metrics into Platform Overview.
   - Add timeframe filters (7d, 30d, 90d) and quick action buttons.
3. **Phase 10.4: User Management & Support Hardening**
   - Add user activity summary to `UserDetailModal` (workout/nutrition counts).
   - Add session eviction action (revoke user sessions without suspension).
   - Add CSV export for user directory.
4. **Phase 10.5: Content, Catalog & Gamification Management**
   - Add badge picker / badges catalog overview to Challenges admin.
   - Add media preview for exercise video URLs.
   - Add barcode search and quick verify for foods.
5. **Phase 10.6: Admin QA, Integration Testing & Stabilization**
   - Comprehensive automated unit tests for all admin modules.
   - E2E verification of all admin workflows.
   - Final report and release sign-off.

---

## 14. Phase 10.2–10.6 Implementation Roadmap

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PHASE 10 IMPLEMENTATION ROADMAP                       │
├───────────────────┬───────────────────────────────────┬─────────────────────┤
│ Subphase          │ Primary Focus                     │ Risk & Dependencies │
├───────────────────┼───────────────────────────────────┼─────────────────────┤
│ **Phase 10.1**    │ Audit, Architecture & Planning    │ None (Read-only)    │
│ (Current)         │ Complete report and roadmap       │                     │
├───────────────────┼───────────────────────────────────┼─────────────────────┤
│ **Phase 10.2**    │ Foundation, Security & Quality    │ Low                 │
│                   │ ESLint fixes, Admin settings,     │ Next.js / React 19  │
│                   │ Toast system, System health       │                     │
├───────────────────┼───────────────────────────────────┼─────────────────────┤
│ **Phase 10.3**    │ Unified Dashboard & Analytics Hub │ Low                 │
│                   │ Cross-domain stats, timeframe     │ Existing workout &  │
│                   │ filters, quick actions            │ nutrition stats APIs│
├───────────────────┼───────────────────────────────────┼─────────────────────┤
│ **Phase 10.4**    │ User Management Enhancements      │ Medium              │
│                   │ Activity overview, session revokes│ Backend users port  │
│                   │ CSV export                        │                     │
├───────────────────┼───────────────────────────────────┼─────────────────────┤
│ **Phase 10.5**    │ Content & Gamification Management │ Medium              │
│                   │ Badge lookup, exercise media,     │ Challenges schema   │
│                   │ barcode search, quick verify      │                     │
├───────────────────┼───────────────────────────────────┼─────────────────────┤
│ **Phase 10.6**    │ Admin QA & Stabilization          │ Low                 │
│                   │ Full test suite, E2E check,       │ All 10.2–10.5 work  │
│                   │ final release sign-off            │                     │
└───────────────────┴───────────────────────────────────┴─────────────────────┘
```

---

## 15. Phase 11 Real Data Integration Boundaries

To prevent redundant work, the boundary between Phase 10 and Phase 11 is strictly defined:
- **Phase 10 (Admin Enhancements)**: Focuses on the *interfaces, tools, security, and administrative workflows* required to manage data within FitOnus. It operates exclusively on data in Neon PostgreSQL.
- **Phase 11 (Real Data Integration)**: Focuses on *external data pipelines and integrations* — automated ingestion of the USDA FoodData Central API, Open Food Facts barcode database, ExerciseDB video datasets, and live wearable data bridges.
- **Rule**: Phase 10 will build the UI fields and verify modals; Phase 11 will build the external ingestion workers.

---

## 16. Dependencies, Blockers & Parallel Worktree Protection

### Blockers:
- **Migration 0012**: Phase 9 migration remains unapplied to Neon Dev. Phase 10 does not depend on migration 0012 (it does not modify mobile `user_settings` columns).
- **Phase 8 Parallel Worktree**: CI repair work is running in an isolated worktree (`/tmp/fitonus-ci-repair`). Admin files are completely separate from the backend worktree, guaranteeing zero merge conflicts.

---

## 17. Git Safety Confirmation

- **Staged Files**: `0` (Zero files staged).
- **Working Tree**: Preserved. All Phase 9 mobile files and Phase 8 backend files remain untouched.
- **Neon Database**: Untouched. Zero migrations executed. Zero records modified.

---

## 18. Recommended Next Implementation Task

**Recommended Next Step**: Proceed with **Phase 10.2 — Admin Foundation, Security & Code Quality**.

### Phase 10.2 Deliverables:
1. Resolve the 4 ESLint errors and 4 warnings in `admin/` to achieve clean `npm --prefix admin run lint`.
2. Build the Admin Profile & Password Change modal.
3. Build the System Health status badge in `Header.tsx` pinging `GET /health`.
4. Standardize toast notifications across admin actions.
5. Create automated test suite `admin/tests/admin-foundation.test.ts`.

