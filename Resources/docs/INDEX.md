# Documentation index

Project documentation is stored in `Resources/docs/`. The root `docs` symlink points to this same folder. Component documentation stays with its application under `backend/docs/`, `mobile/docs/`, and `admin/docs/`.

Reports record findings at the time they were written. Consult the source and current configuration before relying on an older audit.

## Maintaining documentation

- Keep the root README and component READMEs as entry points.
- Keep `AGENTS.md` and `CLAUDE.md` in their existing component roots so tools can discover their instructions.
- Keep shared requirements, governance, and the numbered `.txt` handbook in `Resources/docs/`.
- Put release and distribution notes in `Resources/docs/releases/` and cross-project audit or implementation reports in `Resources/docs/reports/`.
- Put component guides in `<component>/docs/`, audits in `<component>/docs/audits/`, and phase reports in `<component>/docs/reports/`.
- Keep architecture decision records in `backend/docs/adr/` and UI review screenshots and evidence beside their reports.
- Link new documents here and use links relative to the document containing them.
- Remove unreferenced duplicates and disposable caches; retain source assets, configuration templates, backups, and evidence used by reports.

## Application entry points

- [Repository README](../../README.md)
- [Backend README](../../backend/README.md)
- [Mobile README](../../mobile/README.md)
- [Admin README](../../admin/README.md)
- [Design resources](../Figma/README.md)
- [Design requirement coverage](../Figma/src/docs/fitonus-requirement-coverage.md)

## Project handbook

- [AGENT_RULES.md](AGENT_RULES.md)
- [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md)
- [CHANGELOG.md](CHANGELOG.md)
- [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md)
- [README.md](README.md)

The numbered requirements and engineering guides remain alongside these documents as `01-project-overview.txt` through `27-roadmap.txt`.

## Release notes

- [FITONUS_MOBILE_RELEASE_READINESS_AUDIT.md](releases/FITONUS_MOBILE_RELEASE_READINESS_AUDIT.md)
- [ONUSFIT_EXPO_SETUP.md](releases/ONUSFIT_EXPO_SETUP.md)
- [ONUSFIT_PLAY_INTERNAL_TESTING.md](releases/ONUSFIT_PLAY_INTERNAL_TESTING.md)
- [ONUSFIT_REBRANDING.md](releases/ONUSFIT_REBRANDING.md)
- [ONUSFIT_RELEASE_READINESS.md](releases/ONUSFIT_RELEASE_READINESS.md)

## Project reports

- [FITONUS_ADMIN_APPLICATION_SETTINGS_IMPLEMENTATION_REPORT.md](reports/FITONUS_ADMIN_APPLICATION_SETTINGS_IMPLEMENTATION_REPORT.md)
- [FITONUS_ADMIN_APPLICATION_SETTINGS_REPORT.md](reports/FITONUS_ADMIN_APPLICATION_SETTINGS_REPORT.md)
- [FITONUS_ADMIN_AUTH_ISOLATED_COMMIT_READINESS.md](reports/FITONUS_ADMIN_AUTH_ISOLATED_COMMIT_READINESS.md)
- [FITONUS_ADMIN_LOGIN_401_DIAGNOSIS_REPORT.md](reports/FITONUS_ADMIN_LOGIN_401_DIAGNOSIS_REPORT.md)
- [FITONUS_ADMIN_LOGIN_REDIRECT_FIX_REPORT.md](reports/FITONUS_ADMIN_LOGIN_REDIRECT_FIX_REPORT.md)
- [FITONUS_ANDROID_BETA_BUILD_REPORT.md](reports/FITONUS_ANDROID_BETA_BUILD_REPORT.md)
- [FITONUS_DEV_FRESH_START_AUDIT_REPORT.md](reports/FITONUS_DEV_FRESH_START_AUDIT_REPORT.md)
- [FITONUS_DEV_FRESH_START_EXECUTION_READINESS.md](reports/FITONUS_DEV_FRESH_START_EXECUTION_READINESS.md)
- [FITONUS_DUMMY_DATA_FIX_IMPLEMENTATION_REPORT.md](reports/FITONUS_DUMMY_DATA_FIX_IMPLEMENTATION_REPORT.md)
- [FITONUS_EXISTING_NEON_PRODUCTION_DB_AUDIT.md](reports/FITONUS_EXISTING_NEON_PRODUCTION_DB_AUDIT.md)
- [FITONUS_FITNESS_DATA_QUALITY_REPORT.md](reports/FITONUS_FITNESS_DATA_QUALITY_REPORT.md)
- [FITONUS_FULL_APPLICATION_DUMMY_DATA_AUDIT.md](reports/FITONUS_FULL_APPLICATION_DUMMY_DATA_AUDIT.md)
- [FITONUS_GEMINI_AI_MANAGEMENT_IMPLEMENTATION_REPORT.md](reports/FITONUS_GEMINI_AI_MANAGEMENT_IMPLEMENTATION_REPORT.md)
- [FITONUS_GIT_COMMIT_DEPLOYMENT_AUDIT.md](reports/FITONUS_GIT_COMMIT_DEPLOYMENT_AUDIT.md)
- [FITONUS_NAVIGATION_ANIMATION_AUDIT.md](reports/FITONUS_NAVIGATION_ANIMATION_AUDIT.md)
- [FITONUS_NEON_DEV_BACKUP_VERIFICATION_REPORT.md](reports/FITONUS_NEON_DEV_BACKUP_VERIFICATION_REPORT.md)
- [FITONUS_NOTIFICATION_ANDROID_BUILD_REPORT.md](reports/FITONUS_NOTIFICATION_ANDROID_BUILD_REPORT.md)
- [FITONUS_NOTIFICATION_PHASE_A_FIX_REPORT.md](reports/FITONUS_NOTIFICATION_PHASE_A_FIX_REPORT.md)
- [FITONUS_NOTIFICATION_PHASE_A_IMPLEMENTATION_REPORT.md](reports/FITONUS_NOTIFICATION_PHASE_A_IMPLEMENTATION_REPORT.md)
- [FITONUS_NOTIFICATION_SYSTEM_AUDIT.md](reports/FITONUS_NOTIFICATION_SYSTEM_AUDIT.md)
- [FITONUS_PRE_DEPLOYMENT_SAFETY_REPORT.md](reports/FITONUS_PRE_DEPLOYMENT_SAFETY_REPORT.md)
- [FITONUS_PRE_NOTIFICATION_GIT_CHECKPOINT_REPORT.md](reports/FITONUS_PRE_NOTIFICATION_GIT_CHECKPOINT_REPORT.md)
- [FITONUS_RENDER_DEV_DEPLOYMENT_READINESS_REPORT.md](reports/FITONUS_RENDER_DEV_DEPLOYMENT_READINESS_REPORT.md)
- [FITONUS_VERCEL_ADMIN_CORS_FIX_REPORT.md](reports/FITONUS_VERCEL_ADMIN_CORS_FIX_REPORT.md)

## Backend

- [adr/0001-modular-monolith.md](../../backend/docs/adr/0001-modular-monolith.md)
- [adr/0002-raw-sql-without-orm.md](../../backend/docs/adr/0002-raw-sql-without-orm.md)
- [adr/0003-database-backed-sessions.md](../../backend/docs/adr/0003-database-backed-sessions.md)
- [ai-reliability.md](../../backend/docs/ai-reliability.md)
- [api.md](../../backend/docs/api.md)
- [architecture.md](../../backend/docs/architecture.md)
- [audits/AI_COACH_FINAL_IMPLEMENTATION.md](../../backend/docs/audits/AI_COACH_FINAL_IMPLEMENTATION.md)
- [audits/API_ENDPOINT_INVENTORY.md](../../backend/docs/audits/API_ENDPOINT_INVENTORY.md)
- [audits/AUTHENTICATION_SECURITY_AUDIT.md](../../backend/docs/audits/AUTHENTICATION_SECURITY_AUDIT.md)
- [audits/BACKEND_CURRENT_ARCHITECTURE.md](../../backend/docs/audits/BACKEND_CURRENT_ARCHITECTURE.md)
- [audits/BACKEND_FOLDER_STRUCTURE.md](../../backend/docs/audits/BACKEND_FOLDER_STRUCTURE.md)
- [audits/BACKEND_MASTER_AUDIT.md](../../backend/docs/audits/BACKEND_MASTER_AUDIT.md)
- [audits/CARESURE_ARCHITECTURE_COMPARISON.md](../../backend/docs/audits/CARESURE_ARCHITECTURE_COMPARISON.md)
- [audits/DATABASE_SCHEMA_ANALYSIS.md](../../backend/docs/audits/DATABASE_SCHEMA_ANALYSIS.md)
- [audits/FEATURE_IMPLEMENTATION_STATUS.md](../../backend/docs/audits/FEATURE_IMPLEMENTATION_STATUS.md)
- [audits/PHASE_2B_IMPLEMENTATION_REPORT.md](../../backend/docs/audits/PHASE_2B_IMPLEMENTATION_REPORT.md)
- [audits/PHASE_2_ONBOARDING_CONTRACT.md](../../backend/docs/audits/PHASE_2_ONBOARDING_CONTRACT.md)
- [audits/PHASE_3A_WORKOUT_ARCHITECTURE.md](../../backend/docs/audits/PHASE_3A_WORKOUT_ARCHITECTURE.md)
- [audits/PRODUCTION_READINESS_GAPS.md](../../backend/docs/audits/PRODUCTION_READINESS_GAPS.md)
- [audits/RECOMMENDED_IMPLEMENTATION_ROADMAP.md](../../backend/docs/audits/RECOMMENDED_IMPLEMENTATION_ROADMAP.md)
- [authentication.md](../../backend/docs/authentication.md)
- [database.md](../../backend/docs/database.md)
- [deployment.md](../../backend/docs/deployment.md)
- [development.md](../../backend/docs/development.md)
- [new-module-guide.md](../../backend/docs/new-module-guide.md)
- [notifications.md](../../backend/docs/notifications.md)
- [reports/PHASE_7_FINAL_VERIFICATION_REPORT.md](../../backend/docs/reports/PHASE_7_FINAL_VERIFICATION_REPORT.md)
- [reports/PHASE_7_MIGRATION_0011_SAFETY_REPORT.md](../../backend/docs/reports/PHASE_7_MIGRATION_0011_SAFETY_REPORT.md)
- [reports/PHASE_7_RENDER_DEPLOYMENT_READINESS.md](../../backend/docs/reports/PHASE_7_RENDER_DEPLOYMENT_READINESS.md)
- [reports/PHASE_8_10_FINAL_PUSH_GATE_REPORT.md](../../backend/docs/reports/PHASE_8_10_FINAL_PUSH_GATE_REPORT.md)
- [reports/PHASE_8_11_GITHUB_PUSH_REPORT.md](../../backend/docs/reports/PHASE_8_11_GITHUB_PUSH_REPORT.md)
- [reports/PHASE_8_12_CI_QUALITY_GATE_REPORT.md](../../backend/docs/reports/PHASE_8_12_CI_QUALITY_GATE_REPORT.md)
- [reports/PHASE_8_15_CI_AUTOMATION_REPORT.md](../../backend/docs/reports/PHASE_8_15_CI_AUTOMATION_REPORT.md)
- [reports/PHASE_8_4_IMPLEMENTATION_REPORT.md](../../backend/docs/reports/PHASE_8_4_IMPLEMENTATION_REPORT.md)
- [reports/PHASE_8_6_E2E_PERFORMANCE_REPORT.md](../../backend/docs/reports/PHASE_8_6_E2E_PERFORMANCE_REPORT.md)
- [reports/PHASE_8_7_BUILD_RELEASE_GATE_REPORT.md](../../backend/docs/reports/PHASE_8_7_BUILD_RELEASE_GATE_REPORT.md)
- [reports/PHASE_8_8_RELEASE_PREPARATION_REPORT.md](../../backend/docs/reports/PHASE_8_8_RELEASE_PREPARATION_REPORT.md)
- [reports/PHASE_8_9_COMMIT_CI_REPAIR_REPORT.md](../../backend/docs/reports/PHASE_8_9_COMMIT_CI_REPAIR_REPORT.md)
- [reports/PHASE_8_ADVANCED_ANALYTICS_ARCHITECTURE.md](../../backend/docs/reports/PHASE_8_ADVANCED_ANALYTICS_ARCHITECTURE.md)
- [reports/PHASE_9_2_IMPLEMENTATION_REPORT.md](../../backend/docs/reports/PHASE_9_2_IMPLEMENTATION_REPORT.md)
- [reports/PHASE_9_SETTINGS_ARCHITECTURE.md](../../backend/docs/reports/PHASE_9_SETTINGS_ARCHITECTURE.md)

## Mobile

- [EXPO_GO.md](../../mobile/docs/EXPO_GO.md)
- [audits/AI_TEXT_VOICE_FINAL_REPORT.md](../../mobile/docs/audits/AI_TEXT_VOICE_FINAL_REPORT.md)
- [audits/AUTH_REGISTRATION_FIX_REPORT.md](../../mobile/docs/audits/AUTH_REGISTRATION_FIX_REPORT.md)
- [audits/PHASE_2C_INTEGRATION_REPORT.md](../../mobile/docs/audits/PHASE_2C_INTEGRATION_REPORT.md)
- [audits/REAL_DATA_AUDIT.md](../../mobile/docs/audits/REAL_DATA_AUDIT.md)
- [push-notifications.md](../../mobile/docs/push-notifications.md)
- [reports/PHASE_8_5_IMPLEMENTATION_REPORT.md](../../mobile/docs/reports/PHASE_8_5_IMPLEMENTATION_REPORT.md)
- [reports/PHASE_9_3_IMPLEMENTATION_REPORT.md](../../mobile/docs/reports/PHASE_9_3_IMPLEMENTATION_REPORT.md)
- [reports/PHASE_9_4_IMPLEMENTATION_REPORT.md](../../mobile/docs/reports/PHASE_9_4_IMPLEMENTATION_REPORT.md)
- [reports/PHASE_9_5_FINAL_E2E_QA_REPORT.md](../../mobile/docs/reports/PHASE_9_5_FINAL_E2E_QA_REPORT.md)

## Admin

- [audits/ADMIN_SETUP_GUIDE.md](../../admin/docs/audits/ADMIN_SETUP_GUIDE.md)
- [audits/PHASE_1_2_CARESURE_REVIEW.md](../../admin/docs/audits/PHASE_1_2_CARESURE_REVIEW.md)
- [audits/PHASE_1_2_FINAL_VERIFICATION.md](../../admin/docs/audits/PHASE_1_2_FINAL_VERIFICATION.md)
- [audits/PHASE_1_2_TEST_REPORT.md](../../admin/docs/audits/PHASE_1_2_TEST_REPORT.md)
- [audits/PHASE_1_ADMIN_ARCHITECTURE.md](../../admin/docs/audits/PHASE_1_ADMIN_ARCHITECTURE.md)
- [audits/PHASE_1_ADMIN_AUTH_SECURITY.md](../../admin/docs/audits/PHASE_1_ADMIN_AUTH_SECURITY.md)
- [audits/PHASE_2_ADMIN_API_CONTRACT.md](../../admin/docs/audits/PHASE_2_ADMIN_API_CONTRACT.md)
- [audits/PHASE_2_ADMIN_USER_MANAGEMENT.md](../../admin/docs/audits/PHASE_2_ADMIN_USER_MANAGEMENT.md)
- [reports/PHASE_10_1_ADMIN_AUDIT_ARCHITECTURE.md](../../admin/docs/reports/PHASE_10_1_ADMIN_AUDIT_ARCHITECTURE.md)
- [reports/PHASE_10_2A_IMPLEMENTATION_REPORT.md](../../admin/docs/reports/PHASE_10_2A_IMPLEMENTATION_REPORT.md)

## UI review evidence

- [FITONUS_PREMIUM_UI_REDESIGN_PHASE1.md](fitonus-premium-ui-phase1/FITONUS_PREMIUM_UI_REDESIGN_PHASE1.md)

## UI review evidence — phase 2

- [FITONUS_PREMIUM_UI_REDESIGN_PHASE2.md](fitonus-premium-ui-phase2/FITONUS_PREMIUM_UI_REDESIGN_PHASE2.md)
- [README.md](fitonus-premium-ui-phase2/README.md)
