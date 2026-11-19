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
- N/A

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
