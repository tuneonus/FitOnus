# FitOnus Web Admin — User Management & Phase 2 Onboarding Integration

**Date:** 2026-11-05  
**Author:** Senior Backend & Full-Stack Architect  
**Status:** Complete & Verified  

---

## 1. Overview & Business Context

The User Management module in the FitOnus Web Admin allows administrators and support engineers to oversee user accounts created in Phase 1 (Authentication) and monitor their progress through the Phase 2 Fitness Profile & Onboarding flow.

Administrators have full visibility into:
1. Account lifecycle states (`active`, `disabled`).
2. Security state (verified email, active session count, last active timestamp).
3. Onboarding completion status and current wizard step.
4. Support-oriented fitness profile metadata.

---

## 2. PostgreSQL Data Aggregation

The user management subsystem connects `users`, `user_profiles`, and `auth_sessions` via optimized SQL queries:

```sql
SELECT
  u.id,
  u.email,
  u.display_name,
  u.role,
  u.status,
  u.version,
  p.onboarding_completed,
  p.current_onboarding_step,
  u.created_at,
  u.updated_at,
  u.disabled_at
FROM users u
LEFT JOIN user_profiles p ON p.user_id = u.id
WHERE 1=1
  AND (u.email ILIKE $1 OR u.display_name ILIKE $1)
  AND u.status = $2
  AND p.onboarding_completed = $3
ORDER BY u.created_at DESC
LIMIT $4 OFFSET $5;
```

### 2.1 Performance Indexing
The database relies on indexes established across migrations 0001, 0004, and 0005:
- `users(created_at DESC)` for chronological user directory ordering.
- `user_profiles(user_id)` for sub-millisecond joins.
- `user_profiles(onboarding_completed)` for dashboard funnel queries.
- `auth_sessions(user_id, status)` for active session aggregation.

---

## 3. Phase 2 Fitness Profile Integration

When an administrator views a user detail modal (`GET /api/v1/admin/users/:id`), the backend returns a privacy-conscious `profileMetadata` view:

```json
{
  "user": {
    "id": "aeb9d229-1d58-4471-a368-f64e9f963069",
    "email": "member@fitonus.com",
    "displayName": "Alex Member",
    "role": "member",
    "status": "active"
  },
  "sessionsSummary": {
    "activeSessionsCount": 1,
    "lastActiveAt": "2026-11-05T06:12:00Z"
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
    "dailyCalorieTarget": 2650,
    "dailyProteinGrams": 180,
    "createdAt": "2026-11-04T12:00:00Z",
    "updatedAt": "2026-11-04T12:30:00Z"
  }
}
```

### 3.1 Privacy and Data Protection Rules
1. **Zero Password Leakage:** Password hashes (`password_hash`) are explicitly omitted from all application repositories and Zod schemas.
2. **Sanitized Support View:** Exposes operational parameters (workout location, days/week, calorie target) needed to assist members with training schedule questions without exposing internal algorithm formulas.
3. **Audit Trail Accountability:** Every access and administrative modification is permanently tied to the requesting administrator's ID and IP address.

---

## 4. UI Capabilities in the Admin Portal

### 4.1 Filter and Search
- **Instant Search:** Case-insensitive search on both user name and email.
- **Account Status Filter:** All / Active / Suspended.
- **Onboarding Funnel Filter:** All / Completed / Pending (In-Progress).
- **Role Filter:** All / Member / Administrator.

### 4.2 Account Suspension & Reactivation Flow
- **Suspension Action:**
  1. Admin clicks "Suspend" on user row or detail modal.
  2. Modal prompts for an administrative reason (e.g. "Payment dispute", "Spam activity").
  3. Clicking "Confirm Suspension" sends `POST /api/v1/admin/users/:id/suspend`.
  4. Backend invalidates all active sessions for that user and writes an audit log.
  5. UI dynamically updates user status to `Suspended` and disables active session badges.
- **Reactivation Action:**
  1. Admin clicks "Reactivate" on suspended user row.
  2. Clicking "Confirm Reactivation" sends `POST /api/v1/admin/users/:id/reactivate`.
  3. Backend restores status to `active` and records an audit log.
  4. UI dynamically updates status to `Active`.

