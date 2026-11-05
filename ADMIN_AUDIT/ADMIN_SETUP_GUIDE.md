# FitOnus Web Admin — Complete Setup and Operational Guide

**Date:** 2026-11-05  
**Author:** Senior Backend & Full-Stack Architect  
**Version:** 1.0.0  

---

## 1. System Requirements & Prerequisites

- **Node.js:** v22.0.0 or higher (v22.22+ or v24.x recommended)
- **Package Manager:** `npm` (v10+)
- **Database:** Neon PostgreSQL (with `pgvector` enabled)
- **Ports:**
  - FitOnus Backend API: `3000`
  - FitOnus Web Admin: `3001`
  - FitOnus Mobile Metro (if running): `8081`

---

## 2. Backend Configuration & Setup

### 2.1 Navigate to Backend Directory
```bash
cd /media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend
```

### 2.2 Verify Environment Variables (`.env`)
Ensure `backend/.env` contains the required keys:
```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://<username>:<password>@<neon-hostname>.neon.tech/neondb?sslmode=require
DATABASE_SSL=require
DATABASE_POOL_MAX=10

# CORS whitelist including admin panel on port 3001
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://localhost:8081

JWT_ACCESS_SECRET=<your-32-character-minimum-access-secret>
JWT_ISSUER=fitonus-backend
JWT_AUDIENCE=fitonus-app
HMAC_SECRET=<your-32-character-minimum-hmac-secret>
```

### 2.3 Run Database Migrations
Migrations 0001 through 0005 must be applied:
```bash
npm run db:migrate
```
To check migration status:
```bash
npm run db:migrate:status
```
Expected output:
```text
Migration 0001_create_users.sql: applied
Migration 0002_create_auth_sessions.sql: applied
Migration 0003_create_idempotency_keys.sql: applied
Migration 0004_create_user_profiles.sql: applied
Migration 0005_create_admin_audit_logs.sql: applied
```

### 2.4 Seeded Administrator Account
The database comes seeded with an authorized administrator:
- **Email:** `admin@fitonus.com`
- **Password:** `AdminSecurePass123!`
- **Role:** `admin`

If you need to re-seed or verify:
```bash
npm run db:seed
```

### 2.5 Start Backend Server
```bash
npm run dev
```
The backend starts on `http://localhost:3000` with `/api/v1/admin` endpoints active.

---

## 3. Web Admin Frontend Setup

### 3.1 Navigate to Admin Directory
```bash
cd /media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/admin
```

### 3.2 Verify Environment Variables (`.env.local`)
Ensure `admin/.env.local` contains:
```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1/admin
PORT=3001
```

### 3.3 Install Dependencies
```bash
npm install
```

### 3.4 Start Admin Development Server
Start Next.js on port 3001:
```bash
npm run dev -- -p 3001
```
Or:
```bash
PORT=3001 npm run dev
```

Open your browser to:
```text
http://localhost:3001
```

---

## 4. Navigating the Admin Portal

### 4.1 Login Screen (`/login`)
- Navigate to `http://localhost:3001/login`.
- Enter `admin@fitonus.com` and `AdminSecurePass123!`, or click **"Use Seeded Credentials"** to autofill.
- Click **"Sign In to Admin Portal"**.
- A secure `fitonus_admin_token` cookie is established and the dashboard opens.

### 4.2 Dashboard (`/`)
- View live KPIs aggregated directly from PostgreSQL:
  - Total users, active users, completed onboarding, and suspended accounts.
  - Phase 2 Onboarding completion rate progress bar.
  - 14-day rolling daily registration bar chart.
  - Quick recent users table with shortcut to user directory.

### 4.3 User Directory (`/users`)
- Search by name or email address.
- Filter by account status (Active / Suspended).
- Filter by onboarding state (Completed / Pending).
- Filter by role (Member / Admin).
- Click **"Details"** to open user record, active sessions, and Phase 2 fitness profile metadata.
- Click **"Suspend"** to suspend an abusive or compromised user (revoking all sessions).
- Click **"Reactivate"** to restore account access.

### 4.4 Audit Trail (`/audit-logs`)
- Review chronological history of all administrative activities.
- Filter by action (`admin.login`, `user.suspend`, `user.reactivate`).
- Click **"View"** on any record to inspect the complete JSON metadata payload, client IP address, and timestamp.

---

## 5. Verification Commands

Run full verification suite anytime:

### Backend Checks
```bash
cd /media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend
npm run check
```
Runs `typecheck`, `lint`, `format:check`, `test` (92 unit tests), and `build`.

### Admin Checks
```bash
cd /media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/admin
npm run lint
npm run build
```
Ensures 0 ESLint warnings and compiles all static pages for production.

