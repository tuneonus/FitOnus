# Development Workflow

This document dictates the sequential implementation order for the FitOnus project. Teams and AI agents must follow these phases strictly to ensure dependencies are resolved naturally and technical debt is minimized.

---

## Phase 1: Project Setup

**Goal**: Establish the foundational mono-repo structure, configuration, and design system.
**Deliverables**:
- Mobile Expo project initialized with TypeScript and Expo Router.
- Backend NestJS project initialized with TypeScript using @nestjs/cli.
- ESLint and Prettier configured across the workspace.
- Core UI components (Buttons, Typography, Cards) built according to the Design System.
- Supabase project initialized with the base schema.
**Dependencies**: None.
**Acceptance Criteria**: The mobile app runs on the simulator with a basic layout, the backend server starts successfully, and the database connection is verified.

---

## Phase 2: Authentication

**Goal**: Secure the application and establish user identity.
**Deliverables**:
- Registration and Login screens.
- Onboarding flow (gathering initial user metrics).
- Supabase JWT integration on the backend.
- `AuthContext` and secure token storage using `expo-secure-store`.
**Dependencies**: Phase 1.
**Acceptance Criteria**: A user can create an account, log in, complete onboarding, and persist their session across app restarts.

---

## Phase 3: Dashboard

**Goal**: Provide the central hub for the user's daily health summary.
**Deliverables**:
- Dashboard UI layout.
- Metric cards (Calories, Workouts, Sleep).
- Activity feed component.
- API endpoints to serve daily summary data.
**Dependencies**: Phase 2 (Requires authenticated user context).
**Acceptance Criteria**: The dashboard loads instantly, displaying accurate (or gracefully degraded) daily summary data based on the user's profile.

---

## Phase 4: AI Coach

**Goal**: Implement the core conversational interface and AI backend pipeline.
**Deliverables**:
- AI Chat UI with typing indicators and message bubbles.
- NestJS SSE Controller endpoint returning Observable<MessageEvent> for streaming OpenAI responses.
- AI Memory system (pgvector extraction pipeline).
- Function calling framework to allow the AI to trigger app actions.
**Dependencies**: Phase 2 (Identity required for memory isolation).
**Acceptance Criteria**: A user can chat with the AI, receive streaming responses, and the AI accurately recalls facts from previous sessions.

---

## Phase 5: Workout

**Goal**: Build the exercise tracking and progression system.
**Deliverables**:
- Exercise database UI and search.
- Active workout session tracker (sets, reps, weight logging).
- Rest timer component.
- Backend endpoints for workout CRUD and PR detection.
**Dependencies**: Phase 3 (Dashboard integration), Phase 4 (AI Coach can suggest workouts).
**Acceptance Criteria**: A user can start a workout, log multiple sets across different exercises, finish the workout, and see it reflected in their history.

---

## Phase 6: Nutrition

**Goal**: Implement dietary tracking and caloric management.
**Deliverables**:
- Daily macro/calorie tracking UI.
- Food search and manual entry screens.
- Water intake tracker.
- Backend API for nutrition logging and aggregation.
**Dependencies**: Phase 3 (Dashboard integration).
**Acceptance Criteria**: A user can log meals, track water, and view their daily remaining caloric and macronutrient targets.

---

## Phase 7: Health Integration

**Goal**: Enable passive data ingestion from device sensors.
**Deliverables**:
- Android Health Connect and Apple HealthKit integration services.
- Permission request flow.
- Background sync engine to pull steps, heart rate, and sleep data.
**Dependencies**: Phase 3 (Displaying metrics on dashboard).
**Acceptance Criteria**: The app automatically reads and displays the user's daily step count and resting heart rate without manual entry.

---

## Phase 8: Analytics

**Goal**: Visualize user progress over time.
**Deliverables**:
- Progress dashboard with interactive charts (Victory Native).
- Strength progression graphs.
- Body weight trend analysis (EMA smoothing).
- Progress photo upload and comparison.
**Dependencies**: Phases 5, 6, and 7 (Requires data to analyze).
**Acceptance Criteria**: Users can view accurate, interactive charts showing their workout volume, weight trends, and caloric adherence over various timeframes.

---

## Phase 9: Notifications

**Goal**: Implement engagement triggers and reminders.
**Deliverables**:
- Expo Push Notifications configuration.
- Local notification scheduling (hydration, bedtime).
- Notification preferences screen.
- Backend push token management.
**Dependencies**: Phase 2 (User settings).
**Acceptance Criteria**: Users receive local reminders and remote push notifications, tapping a notification deep-links to the correct screen.

---

## Phase 10: Reports

**Goal**: Generate automated weekly and monthly health summaries.
**Deliverables**:
- Backend CRON jobs for report generation.
- AI-generated narrative summaries.
- In-app report viewer.
- PDF export functionality.
**Dependencies**: Phase 8 (Analytics data), Phase 4 (AI generation).
**Acceptance Criteria**: The system automatically generates a comprehensive weekly report every Monday morning, complete with AI insights.

---

## Phase 11: Performance

**Goal**: Optimize the application for production scale.
**Deliverables**:
- React Native re-renders audit and memoization.
- Image optimization and caching.
- Backend database indexing review and query optimization.
- Redis caching layer implementation (if required).
**Dependencies**: Phases 1-10 (Full feature set).
**Acceptance Criteria**: The mobile app maintains 60fps during navigation, and backend P95 latency is under 200ms.

---

## Phase 12: Testing

**Goal**: Ensure system reliability and prevent regressions.
**Deliverables**:
- Jest unit tests for utility functions and core logic.
- React Native Testing Library tests for critical UI components.
- Supertest integration tests for backend APIs.
- Maestro/Detox E2E test scripts.
**Dependencies**: Phases 1-10.
**Acceptance Criteria**: The CI pipeline achieves >80% code coverage on core logic, and E2E tests pass reliably on nightly builds.

---

## Phase 13: Deployment

**Goal**: Release the application to staging and production environments.
**Deliverables**:
- Dockerized backend deployed to cloud infrastructure.
- EAS Build configuration for iOS and Android.
- TestFlight and Google Play internal track distribution.
- Production database migration plan.
**Dependencies**: Phases 1-12.
**Acceptance Criteria**: A production-ready binary is available in the respective app store consoles, pointing to a secure, scaled production backend.
