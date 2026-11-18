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

## AI engineering context

- [Baseline findings](../../AI_ENGINEERING_BASELINE.md)
- [Architecture proposal](../../AI_ARCHITECTURE_PROPOSAL.md)
- [Engineering roadmap](../../AI_ENGINEERING_ROADMAP.md)

The architecture proposal and roadmap describe planned work. They do not indicate that the proposed services or integrations exist.

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
- [design/onboarding.md](../../backend/docs/design/onboarding.md)
- [design/settings.md](../../backend/docs/design/settings.md)
- [design/workouts.md](../../backend/docs/design/workouts.md)
- [development.md](../../backend/docs/development.md)
- [new-module-guide.md](../../backend/docs/new-module-guide.md)
- [notifications.md](../../backend/docs/notifications.md)

## Mobile

- [Mobile README](../../mobile/README.md)
- [EXPO_GO.md](../../mobile/docs/EXPO_GO.md)
- [push-notifications.md](../../mobile/docs/push-notifications.md)
- [Notification integration patches](../../mobile/docs/notification-integration-patches/)

## Admin

- [Admin README](../../admin/README.md)
- [architecture.md](../../admin/docs/architecture.md)
- [setup.md](../../admin/docs/setup.md)

## Design references

- [Design resources](../Figma/README.md)
- [Requirement coverage](../Figma/src/docs/fitonus-requirement-coverage.md)
