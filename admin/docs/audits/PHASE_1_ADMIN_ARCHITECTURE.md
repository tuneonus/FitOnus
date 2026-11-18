# FitOnus Web Admin — System Architecture (Phase 1 & Phase 2)

**Date:** 2026-11-05  
**Author:** Senior Backend & Full-Stack Architect  
**Status:** Complete & Verified  

---

## 1. High-Level Architecture Overview

The FitOnus Web Admin platform is built as a high-performance, secure management portal connecting directly to the FitOnus backend modular monolith.

```
┌────────────────────────────────────────────────────────┐
│           FitOnus Admin Web Frontend (Next.js 16)       │
│  - App Router: /, /login, /users, /audit-logs          │
│  - Context: AuthProvider (Route Guards & Session Sync) │
│  - Design: Tailwind CSS 4, Dark Slate + Teal Aesthetic │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTP / JSON (Credentials: Include)
                           │ HttpOnly Cookie + Bearer Fallback
┌──────────────────────────▼─────────────────────────────┐
│             FitOnus Backend (Node.js 22 / Express 5)   │
│  Route Group: /api/v1/admin                            │
│  - Auth Controller & Middleware (RBAC + Rate Limiting) │
│  - Use Cases: Login, Stats, Users, Suspend, Audit Logs │
│  - Postgres Repositories: Raw SQL with Pool            │
└──────────────────────────┬─────────────────────────────┘
                           │ Raw SQL
┌──────────────────────────▼─────────────────────────────┐
│                 Neon PostgreSQL Database               │
│  Tables: users, auth_sessions, user_profiles,          │
│          user_settings, admin_audit_logs               │
└────────────────────────────────────────────────────────┘
```

---

## 2. Frontend Architecture (`FitOnus/admin/`)

The frontend is built on Next.js 16 (App Router), React 19, and Tailwind CSS 4.

### 2.1 File Structure
```
FitOnus/admin/
├── app/
│   ├── layout.tsx            # Global layout with AuthProvider & Google Geist font
│   ├── globals.css           # Tailwind 4 dark theme, brand variables, custom scrollbars
│   ├── page.tsx              # Dashboard overview (live metrics, trend charts, recent users)
│   ├── login/page.tsx        # Secure admin login form with rate-limit protection
│   ├── users/page.tsx        # User directory, search, filter, detail modal, suspend/reactivate
│   └── audit-logs/page.tsx   # Chronological security event trail with JSON inspector
├── components/
│   ├── layout/
│   │   ├── AdminLayout.tsx   # Master wrapper with authentication guard and responsive grid
│   │   ├── Header.tsx        # Sticky top bar with backend status and refresh triggers
│   │   └── Sidebar.tsx       # Brand logo, navigation links, and admin profile card
│   └── ui/
│       ├── Badge.tsx         # Semantic badges (active, disabled, completed, pending, admin)
│       ├── EmptyState.tsx    # Empty data state container
│       ├── LoadingSpinner.tsx# Animated glowing spinner
│       ├── Modal.tsx         # Accessible backdrop modal with escape key listener
│       └── StatsCard.tsx     # Metric card with gradient accents and trend indicators
├── context/
│   └── AuthContext.tsx       # Auth provider, session hydration, and automatic redirects
├── lib/
│   ├── api.ts                # Strongly-typed API client with dual cookie/bearer support
│   └── types.ts              # TypeScript interfaces matching backend response envelopes
├── next.config.ts            # Next.js configuration and proxy rewrites
└── tsconfig.json             # TypeScript configuration
```

### 2.2 Routing & Route Guards
1. **Unauthenticated Redirect:** Any attempt to access `/`, `/users`, or `/audit-logs` without an authenticated session triggers an immediate client redirect to `/login`.
2. **Authenticated Redirect:** An authenticated administrator navigating to `/login` is automatically redirected to `/`.
3. **Session Hydration:** On initial page load, `AuthProvider` queries `GET /api/v1/admin/auth/me`. If the session is invalid or expired, session state is cleared and user is redirected to `/login`.

---

## 3. Backend Architecture (`FitOnus/backend/src/modules/admin/`)

The backend admin module strictly adheres to Clean Architecture principles and the existing modular monolith pattern.

### 3.1 File Structure
```
backend/src/modules/admin/
├── domain/
│   ├── admin-audit-log.ts              # Audit log domain model and action types
│   └── dashboard-stats.ts              # Dashboard statistics domain entity
├── application/
│   ├── ports.ts                        # Admin repository and query interfaces
│   └── use-cases/
│       ├── admin-login.ts              # Authenticates admin role and records audit log
│       ├── change-user-status.ts       # Suspend / reactivate with session revocation
│       ├── get-admin-user.ts           # Aggregates user, session, and fitness profile
│       ├── get-dashboard-stats.ts      # Computes live platform KPIs
│       ├── list-admin-users.ts         # Filterable, paginated user management query
│       └── list-audit-logs.ts          # Paginated security audit event trail
├── infrastructure/
│   └── pg-admin-repository.ts          # Raw SQL implementation with PostgreSQL
├── interface/
│   ├── admin.controller.ts             # Route handlers and cookie generation
│   ├── admin.routes.ts                 # Declarative route definitions with Zod schemas
│   └── admin.schemas.ts                # Request validation and response schemas
└── index.ts                            # Composition root and public module exports
```

### 3.2 Dependency Flow
- **Interface Layer (`admin.routes.ts`, `admin.controller.ts`)** receives HTTP requests, validates input using Zod schemas, checks permissions (`requirePermission`), and delegates to use cases.
- **Application Layer (`use-cases/`)** orchestrates business logic, checks domain rules (e.g. self-suspension guard), interacts with `AdminRepository`, `UserRepository`, and `SessionRepository`.
- **Infrastructure Layer (`pg-admin-repository.ts`)** executes raw SQL queries against PostgreSQL connection pool.
- **Domain Layer (`domain/`)** holds pure entities and value types without external dependencies.

