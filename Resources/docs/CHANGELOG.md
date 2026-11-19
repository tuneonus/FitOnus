# Changelog

All notable changes to the FitOnus project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- AI observability (Phase 9): structured JSON logs in the Python AI backend with the same field names as the Node API, a correlation id sent from Node to Python (`X-Correlation-Id`), a shared error-category vocabulary, events for coach insights cache hits and deterministic fallbacks, and log-redaction tests; learning guide `ai/learning/07-ai-observability.md`. No behavior, API, database or deployment change.
- Initial project documentation suite (docs 01-27).
- Project governance documents (README, AGENT_RULES, DEVELOPMENT_WORKFLOW, ARCHITECTURE_DECISIONS).
- Foundational repository structure for mobile and backend.

### Changed
- Reduced documentation to agent instructions, product requirements, component guides, retained feature designs, and operational references; refreshed the documentation index and admin setup guide.
- Organized release notes under `Resources/docs/releases/`, project reports under `Resources/docs/reports/`, and component audits and phase reports under each component's `docs/audits/` and `docs/reports/` folders.
- Added a repository README and documentation index with placement rules; updated moved-document references.

### Removed
- Removed historical audit, implementation, and test reports plus UI review screenshots and generated evidence files. Their committed versions remain available in Git history.
- Removed an unused duplicate notification image and local generated cache files.

### Fixed
- Migrations `0019_add_coach_message_feedback.sql` and `0020_add_gemini_fallback_model.sql` were never committed: the 2026-11-18 change that added the `*.sql` ignore rule also added the code that needs them. They are now tracked, the rule has an exception for `backend/migrations/`, and a unit test guards it.
- Integration tests simulated "AI backend unreachable" with port 9, which `fetch` blocks (no `ECONNREFUSED`, so the quota refund path was never taken); they now use a port that refuses connections. One rate-limit test expected an envelope the limiter had intentionally changed (`details.retryAfterSeconds`) and was updated.
- CI now also runs for `development` (push and pull request).

### Security
- N/A

---

## [0.1.0] - YYYY-MM-DD
*(Template for future releases)*

### Added
- [Feature description]

### Changed
- [Modification description]

### Removed
- [Deprecation/Removal description]

### Fixed
- [Bug fix description]

### Security
- [Security patch description]
