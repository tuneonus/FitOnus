# Admin architecture

The admin application uses Next.js App Router and TypeScript. Its package manifest defines the framework version. Read `admin/AGENTS.md` before editing framework code.

| Location | Responsibility |
| --- | --- |
| `app/` | Routes, root layout, global styles, and application error boundary |
| `src/features/` | Feature-specific views, hooks, API calls, and types |
| `src/components/` | Shared layout, controls, and design components |
| `src/features/auth/` | Login, account settings, and authentication context |
| `src/lib/api-client.ts` | Backend URL, bearer token header, timeout, and response handling |
| `src/lib/token-storage.ts` | Browser token persistence adapter |
| `src/lib/error-normalizer.ts` | User-facing API error messages |
| `src/context/ToastContext.tsx` | Shared toast notifications |
| `tests/` | Admin behavior and backend contract checks |

The API base is `NEXT_PUBLIC_API_URL`, defaulting to `http://localhost:3000/api/v1/admin`. The client sends a bearer token when present and includes credentials. Backend authentication and permission checks enforce access to admin routes. Update both API and UI contracts when changing payloads.

Feature routes cover the dashboard, users, workouts, nutrition, challenges, notifications, settings, and audit logs. Gemini configuration and usage views live in `src/features/settings/`; provider calls and secret handling belong to the backend.

Use [setup](setup.md) for local commands and [backend architecture](../../backend/docs/architecture.md) for server boundaries. The source code is authoritative for route and session behavior.
