# FitOnus

## Project Introduction

FitOnus is a next-generation, AI-powered health, fitness, nutrition, and wellness platform designed to replace fragmented health applications. Built for iOS and Android using React Native and Expo, and supported by a high-performance Node.js backend, FitOnus acts as a singular hub for tracking physical activity, monitoring diet, optimizing sleep, managing recovery, and gaining actionable insights through our proprietary AI Coach.

## Project Vision

Our vision is to democratize elite-level personal training and nutrition coaching. By combining passive data ingestion (via Apple HealthKit and Android Health Connect), manual input, and cutting-edge artificial intelligence, FitOnus delivers personalized, evidence-based guidance in real-time. We aim to provide an experience comparable to having a dedicated fitness professional and nutritionist available 24/7, presented through a stunning, premium user interface inspired by Apple Health and modern SaaS applications.

## Technology Stack

### Mobile Application (Frontend)
- **Framework**: React Native with Expo (SDK 57)
- **Language**: TypeScript (Strict Mode)
- **Routing**: Expo Router (File-based navigation)
- **State Management**: Zustand (Client state), TanStack React Query (Server state)
- **Persistence**: react-native-mmkv (High-performance KV store), expo-secure-store (Credentials)
- **Styling**: Vanilla React Native StyleSheet (No Tailwind)
- **Animations**: react-native-reanimated, lottie-react-native
- **Networking**: Axios

### Backend Services
- **Framework**: Node.js with NestJS
- **Language**: TypeScript
- **Database**: PostgreSQL (via Supabase)
- **Authentication**: Supabase Auth (JWT)
- **AI Integration**: OpenAI API (gpt-4o, text-embedding-3-small)
- **Vector Search**: pgvector (for AI Memory and RAG)
- **Validation**: Zod
- **Background Jobs**: BullMQ
- **Logging**: Pino

## Folder Structure

The repository follows a strict mono-repo style structure, separated into mobile and backend domains. For detailed breakdowns, refer to `docs/04-folder-structure.txt`.

```
FitOnus/
├── docs/                 # Authoritative project documentation
├── mobile/               # React Native Expo application
│   ├── src/
│   │   ├── app/          # Expo Router file-based navigation
│   │   ├── features/     # Feature-first domain modules (auth, workouts, nutrition, etc.)
│   │   ├── components/   # Shared UI components and design system
│   │   └── lib/          # Core utilities, API clients, and constants
├── backend/              # Node.js NestJS server
│   ├── src/
│   │   ├── ai/           # AI orchestrator, memory, and RAG pipelines
│   │   ├── modules/      # NestJS Modules (Controllers, Services)
│   │   ├── common/       # Guards, Interceptors, Pipes, Filters
│   │   └── db/           # Database models and repositories
├── shared/               # Shared TS types and schemas
└── supabase/             # Database migrations and edge functions
```

## Documentation Structure

The `docs/` folder contains the authoritative engineering handbook for this project. It is organized sequentially to provide a comprehensive understanding of the system:

- `01` to `04`: Foundation (Overview, Architecture, Standards, Folder Structure)
- `05` to `07`: Core UI & Identity (Design System, Auth, User Management)
- `08` to `11`: Primary Features (Dashboard, AI Coach, Workouts, Nutrition)
- `12` to `16`: Health & Analytics (Health Connect, Weight, Sleep, Recovery, Progress)
- `17` to `19`: System Infrastructure (Notifications, Reports, Backend API)
- `20` to `23`: Data & Integrations (Database Design, AI Memory, RAG, Integrations)
- `24` to `27`: Operations (Testing, Deployment, Security, Roadmap)

Additionally, governance documents (`AGENT_RULES.md`, `DEVELOPMENT_WORKFLOW.md`, `ARCHITECTURE_DECISIONS.md`, `CHANGELOG.md`) dictate the operational procedures for all contributors.

## How Developers Should Use the Documentation

1. **New Onboarding**: Read `01-project-overview.txt`, `02-architecture.txt`, and `03-coding-standards.txt` thoroughly before writing any code.
2. **Feature Development**: Before touching a specific feature (e.g., Workouts), read its corresponding document (e.g., `10-workout-system.txt`) to understand the requirements, API contracts, and database schema.
3. **UI Implementation**: Always consult `05-design-system.txt` for typography, spacing, and color tokens. Never hardcode styles.
4. **AI Agents**: Autonomous agents MUST read `AGENT_RULES.md` and the relevant feature documentation before proposing or executing code changes.

## Development Phases

Development is structured into sequential phases to ensure a stable foundation before building complex features. See `DEVELOPMENT_WORKFLOW.md` for detailed deliverables per phase.

1. Project Setup
2. Authentication
3. Dashboard
4. AI Coach
5. Workout
6. Nutrition
7. Health Integration
8. Analytics
9. Notifications
10. Reports
11. Performance
12. Testing
13. Deployment

## Coding Workflow

1. **Branching**: Branch from `main` using the format `feature/feature-name` or `fix/issue-description`.
2. **Development**: Follow the Feature-First architecture. Keep components pure and side-effect free.
3. **Validation**: Ensure TypeScript compilation passes (`tsc --noEmit`) and ESLint reports zero errors.
4. **Testing**: Write Jest tests for utility functions and React Native Testing Library tests for complex components.
5. **Commit**: Use Conventional Commits format (e.g., `feat(auth): implement Google sign-in`).
6. **PR Review**: Submit a Pull Request targeting `main`. All PRs require passing CI checks and at least one manual review.

## AI Workflow

For AI coding agents contributing to this repository:
1. **Contextualize**: The agent must ingest `AGENT_RULES.md` and the specific documentation file for the feature it is tasked with building.
2. **Plan**: Generate an implementation plan detailing the files to be created/modified.
3. **Execute**: Write the code strictly adhering to the established architecture and design system.
4. **Verify**: Ensure the generated code compiles, lints, and integrates seamlessly with existing systems.

## Contribution Guide

We welcome contributions! Please ensure you have read the architecture guidelines and coding standards. If you are introducing a new architectural pattern or dependency, you must first propose it by updating `ARCHITECTURE_DECISIONS.md` and receiving approval from the core engineering team.

## Versioning

FitOnus uses [Semantic Versioning](https://semver.org/) (MAJOR.MINOR.PATCH):
- **MAJOR**: Incompatible API changes or massive architectural shifts.
- **MINOR**: Add functionality in a backward-compatible manner.
- **PATCH**: Backward-compatible bug fixes.

All notable changes must be documented in `CHANGELOG.md`.

## Future Roadmap Summary

- **Phase 1 (MVP)**: Core tracking (workouts, nutrition, sleep) and AI Coach foundation.
- **Phase 2 (Intelligence)**: RAG, AI Memory, and automated progressive overload recommendations.
- **Phase 3 (Engagement)**: Gamification, wearables integration, and subscriptions.
- **Phase 4 (Social)**: Community challenges, social feeds, and trainer portals.

For detailed roadmap planning, refer to `27-roadmap.txt`.
