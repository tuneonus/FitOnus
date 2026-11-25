# Documentation index

Keep the context needed to maintain the application: agent instructions, product requirements, component guides, feature contracts, and operational references. The root `docs` symlink points to this folder.

## Start here

- [Coding agent guide](../../AGENTS.md)
- [Project handbook](README.md)
- [Project rules](AGENT_RULES.md)
- [Architecture decisions](ARCHITECTURE_DECISIONS.md)
- [Original development plan](DEVELOPMENT_WORKFLOW.md)
- [Changelog](CHANGELOG.md)

## Maintaining documentation

- Keep `AGENTS.md` and `CLAUDE.md` in their existing locations for agent discovery.
- Keep shared product requirements and governance here; keep implementation guides with their component.
- Update existing guides when behavior changes. Keep feature designs under `backend/docs/design/` and operational references under `operations/`.
- Numbered requirements and retained dated designs include original planning intent. Component source and package manifests define current implementation and versions.
- Add task reports and screenshot exports when requested; avoid accumulating duplicate audit and test reports.
- Use relative links and update this index when moving or adding a guide.
- Application source, tests, assets, configuration, migrations, and local backups are outside documentation cleanup.
- Removed historical reports and review exports can be recovered from Git history at commit `1d41c37`.

## Architecture

- [Project structure](architecture/PROJECT_STRUCTURE.md): repository layout, module rules, where AI code lives, Node ↔ Python boundary

## AI engineering context

- [Baseline findings](../../AI_ENGINEERING_BASELINE.md)
- [Architecture proposal](../../AI_ARCHITECTURE_PROPOSAL.md)
- [Engineering roadmap](../../AI_ENGINEERING_ROADMAP.md)
- [AI learning guides](ai-learning/existing-ai-engineering/00-learning-index.md)
- [Phase 09: AI Agent Fundamentals](ai-learning/phase-09-ai-agent-fundamentals.md)
- [Phase 10: LangGraph Agent Workflows](ai-learning/phase-10-langgraph-agent-workflows.md)
- [Phase 11: AI Workout Planner](ai-learning/phase-11-ai-workout-planner.md)
- [Phase 12: AI Agent Protocols & Tool Ecosystem](ai-learning/phase-12-ai-agent-protocols-and-tool-ecosystem.md)
- [Phase 12 Learning Guide](../../PHASE_12_LEARNING_GUIDE.md)
- [Phase 13: Multi-Agent Systems](ai-learning/phase-13-multi-agent-systems.md)
- [Phase 17: AI Observability](ai-learning/phase-17-ai-observability.md)
- [Phase 15: Multimodal AI Engineering](ai-learning/phase-15-multimodal-ai-engineering.md)
- [Phase 16: AI Security & Guardrails](ai-learning/phase-16-ai-security-guardrails.md)
- [Phase 18: Advanced AI Evaluation](ai-learning/phase-18-advanced-ai-evaluation.md)

The architecture proposal and roadmap describe planned work. They do not indicate that the proposed services or integrations exist.

## Python AI backend (`ai-backend/`)

- [README](../../ai-backend/README.md): what it does, environment variables, how to run and check it
- [Render deployment guide](../../ai-backend/docs/render-deployment.md): service type, build and start settings, environment variables, Node-to-Python connection, service-token authentication, free versus paid limits (preparation only: nothing is deployed)
- [Migration readiness assessment](ai/PYTHON_MIGRATION_READINESS.md) and the walkthroughs in `ai/learning/` (01 chat integration, 02 Python-only architecture, 03 voice meal, 04 speech transcription, 05 meal photo, 06 coach insights, 07 AI observability: structured logs, correlation ids and error categories)

## Product requirements

- [01-project-overview.txt](01-project-overview.txt)
- [02-architecture.txt](02-architecture.txt)
- [03-coding-standards.txt](03-coding-standards.txt)
- [04-folder-structure.txt](04-folder-structure.txt)
- [05-design-system.txt](05-design-system.txt)
- [06-authentication.txt](06-authentication.txt)
- [07-user-management.txt](07-user-management.txt)
- [08-dashboard.txt](08-dashboard.txt)
- [09-ai-coach.txt](09-ai-coach.txt)
- [10-workout-system.txt](10-workout-system.txt)
- [11-nutrition-system.txt](11-nutrition-system.txt)
- [12-health-connect.txt](12-health-connect.txt)
- [13-weight-management.txt](13-weight-management.txt)
- [14-sleep-tracking.txt](14-sleep-tracking.txt)
- [15-recovery-system.txt](15-recovery-system.txt)
- [16-progress-analytics.txt](16-progress-analytics.txt)
- [17-notifications.txt](17-notifications.txt)
- [18-reports.txt](18-reports.txt)
- [19-backend-api.txt](19-backend-api.txt)
- [20-database-design.txt](20-database-design.txt)
- [21-ai-memory.txt](21-ai-memory.txt)
- [22-rag-system.txt](22-rag-system.txt)
- [23-third-party-integrations.txt](23-third-party-integrations.txt)
- [24-testing-strategy.txt](24-testing-strategy.txt)
- [25-deployment-guide.txt](25-deployment-guide.txt)
- [26-security-privacy.txt](26-security-privacy.txt)
- [27-roadmap.txt](27-roadmap.txt)
- [Original product vision](text.txt)

## Operations

- [mobile-release-readiness.md](operations/mobile-release-readiness.md)
- [production-database.md](operations/production-database.md)

## Release setup

- [ONUSFIT_EXPO_SETUP.md](releases/ONUSFIT_EXPO_SETUP.md)
- [ONUSFIT_PLAY_INTERNAL_TESTING.md](releases/ONUSFIT_PLAY_INTERNAL_TESTING.md)

## Backend

- [Backend README](../../backend/README.md)
- [adr/0001-modular-monolith.md](../../backend/docs/adr/0001-modular-monolith.md)
- [adr/0002-raw-sql-without-orm.md](../../backend/docs/adr/0002-raw-sql-without-orm.md)
- [adr/0003-database-backed-sessions.md](../../backend/docs/adr/0003-database-backed-sessions.md)
- [ai-reliability.md](../../backend/docs/ai-reliability.md)
- [api.md](../../backend/docs/api.md)
- [architecture.md](../../backend/docs/architecture.md)
- [authentication.md](../../backend/docs/authentication.md)
- [database.md](../../backend/docs/database.md)
- [deployment.md](../../backend/docs/deployment.md)
- [design/analytics.md](../../backend/docs/design/analytics.md)
- [design/nutrition.md](../../backend/docs/design/nutrition.md)
- [design/onboarding.md](../../backend/docs/design/onboarding.md)
- [design/settings.md](../../backend/docs/design/settings.md)
- [design/workouts.md](../../backend/docs/design/workouts.md)
- [development.md](../../backend/docs/development.md)
- [media.md](../../backend/docs/media.md): public images (notifications, exercises, workout template covers), the storage policy, replacement and deletion rules, the image-key registry, why meal photos are never stored, and the route-specific body limits for base64 AI routes
- [new-module-guide.md](../../backend/docs/new-module-guide.md)
- [private-media.md](../../backend/docs/private-media.md): private member pictures (profile picture, progress photos): the separate private bucket and its credentials, signed-URL reads, ownership rules, the deletion queue and worker, the 50-photo limit, and how to test without real storage
- [notifications.md](../../backend/docs/notifications.md)

## Mobile

- [Mobile README](../../mobile/README.md)
- [EXPO_GO.md](../../mobile/docs/EXPO_GO.md)
- [push-notifications.md](../../mobile/docs/push-notifications.md)
- [private-photos.md](../../mobile/docs/private-photos.md): profile picture and progress photos on the phone: signed URLs, image-cache keys and sign-out clearing, upload, picker configuration, and the live screens
- [WORKOUT_ASSET_STANDARD.md](WORKOUT_ASSET_STANDARD.md): workout exercise image display, 5:4 aspect ratio standard, static WebP, character consistency, and stable ID mapping
- [Notification integration patches](../../mobile/docs/notification-integration-patches/)

## Admin

- [Admin README](../../admin/README.md)
- [architecture.md](../../admin/docs/architecture.md)
- [setup.md](../../admin/docs/setup.md)

## Design references

- [Design resources](../Figma/README.md)
- [Requirement coverage](../Figma/src/docs/fitonus-requirement-coverage.md)
