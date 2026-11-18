# FitOnus agent guide

Start with this file, [the project rules](Resources/docs/AGENT_RULES.md), and the [documentation index](Resources/docs/INDEX.md). Read component-specific `AGENTS.md` and `CLAUDE.md` instructions before working in that component.

## Current implementation

- `backend/`: Express 5, TypeScript, PostgreSQL through `pg`, and Google Gemini through `@google/genai`. Read [backend architecture](backend/docs/architecture.md), [authentication](backend/docs/authentication.md), and [database conventions](backend/docs/database.md).
- `mobile/`: React Native with Expo Router, Zustand, TanStack Query, AsyncStorage for preferences, and SecureStore for credentials. Read [Expo setup](mobile/docs/EXPO_GO.md) and [notifications](mobile/docs/push-notifications.md).
- `admin/`: Next.js App Router with feature modules under `src/features/`. Read [admin setup](admin/docs/setup.md) and [architecture](admin/docs/architecture.md).
- `Resources/Figma/`: design reference source. Application implementations live in `mobile/` and `admin/`.

Use each component's `package.json` and lockfile for installed versions. The numbered handbook documents describe product requirements and include older proposed technologies. Check the source before implementing a proposal. Read the AI baseline, architecture proposal, and roadmap linked in the documentation index when working on AI; proposals do not authorize architecture changes.

## Where changes belong

Backend feature modules use `domain`, `application`, `infrastructure`, and `interface` layers. Import other modules through their public `index.ts`; wire implementations in composition roots. Mobile and admin changes belong with their feature. Reuse shared UI and API clients.

Keep migrations, tests, environment templates, assets, and build configuration. Keep local credentials and backups out of commits. Documentation changes do not require running database cleanup, seeding, migrations, or deployment commands.

## Verification

Install dependencies in the relevant components with `npm ci`. Admin and mobile test scripts also require backend dependencies because they use the backend's `tsx` executable.

| Component | Checks |
| --- | --- |
| Backend | `npm --prefix backend run typecheck`, `npm --prefix backend run lint`, `npm --prefix backend test`, `npm --prefix backend run build` |
| Mobile | `npm --prefix mobile run typecheck`, `npm --prefix mobile run lint`, `npm --prefix mobile test` |
| Admin | Run `node_modules/.bin/tsc --noEmit` from `admin/`, then `npm --prefix admin run lint`, `npm --prefix admin test`, `npm --prefix admin run build` |

Run checks relevant to the change and report failures accurately. Keep lasting explanations in the existing guides. Create additional task reports or screenshots when requested.
