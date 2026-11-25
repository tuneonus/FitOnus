# Phase 16: AI Security & Guardrails

Comprehensive security audit, hardening, dependency remediation, and offline adversarial benchmarking across FitOnus (`ai-backend/`, `backend/`, and `admin/`).

## 1. End-to-End Security Architecture Audit

FitOnus enforces defense-in-depth across three runtime tiers:

1. **Identity, Quota & Abuse Controls (`backend/`)**:
   - External user JWTs are verified in [`authenticate.ts`](../../../backend/src/middleware/authenticate.ts) and [`jose-access-token-service.ts`](../../../backend/src/modules/auth/infrastructure/jose-access-token-service.ts) with pinned `HS256`, issuer, audience, DB-backed session revocation, and active account status checks.
   - AI endpoints apply fail-closed quota gating (`AiUsageGate`), feature/user rate limiting (`ai-rate-limit.ts`), and request idempotency (`idempotency.ts`).
   - RAG chunks retrieved from `PgKnowledgeRepository` pass through [`RagContextBuilder`](../../../backend/src/modules/knowledge/domain/rag-context-builder.ts) before entering Python prompts, and sensitive AI memories are consent-gated in `MemoryExtractionWorker` / `PgMemoryRepository`.

2. **Service-to-Service Trust & Request Boundaries (`ai-backend/`)**:
   - Node ↔ Python calls use short-lived HS256 service JWTs verified via [`verify_service_token`](../../../ai-backend/src/onusfit_ai/shared/auth/auth.py), strict single-use `jti` tracking in `ReplayCache`, and route-level scope checks (`require_scope`, including `ai:tools:read` for internal tool callbacks).
   - [`RequestBodyLimitMiddleware`](../../../ai-backend/src/onusfit_ai/shared/request_limits/body_limit.py) enforces payload bounds (`413`) prior to body buffering.
   - [`logging.py`](../../../ai-backend/src/onusfit_ai/shared/logging/logging.py) (`redact`, `clean_fields`, `sanitize_error_summary`) and [`ports.py`](../../../ai-backend/src/onusfit_ai/shared/llm/ports.py) (`sanitize_tool_error`) prevent API key, JWT, stack trace, internal IP, and PII leakage.

3. **Prompt, Tool, Media & Streaming Safety (`ai-backend/`)**:
   - Multimodal uploads pass magic-byte inspection, HTML/script polyglot rejection, dimension/pixel bomb caps (`40_000_000` pixels / `8 MiB`), and audio duration/byte checks (`inspect_image_bytes`, `inspect_audio_bytes`).
   - MCP execution isolates user identity via server-bound `user_id`, Pydantic `extra="forbid"` schemas, HITL approval tickets in `AgentToolOrchestrator`, read-only defaults in `McpClientAdapter(include_write_tools=False)`, and capability/budget enforcement in `MultiAgentMcpGateway` and `CumulativeBudgetTracker`.

## 2. Hardening Implemented in Phase 16

### Shared Guardrails & Bilingual Safety (`shared/utils/guardrails.py`)
Created [`guardrails.py`](../../../ai-backend/src/onusfit_ai/shared/utils/guardrails.py) in `PURE_SHARED` (`shared.utils`) so domain, application, and MCP layers share consistent fail-closed controls without breaking Clean Architecture boundaries:
- **`sanitize_untrusted_text` & `strip_invisible_and_control`**: Strips zero-width, BOM, bidi-override characters (`\u200b-\u200f`, `\u202a-\u202e`, `\u2060-\u206f`, `\ufeff`) and control bytes prior to neutralizing XML boundary breakouts (`</system>`, `</retrieved_knowledge>`, `</conversation>`, `<developer>`, `<grounding_observations>`, etc.), chat-template markers (`<|im_start|>`, `<|im_end|>`, `[INST]`, `<<SYS>>`), fenced `system` blocks, and override directives (`SYSTEM INSTRUCTION:`, `CRITICAL RULES:`, `DEVELOPER:`, `IGNORE PREVIOUS INSTRUCTIONS`), while preserving benign English/Tamil/Tanglish golden prompts verbatim.
- **`assess_input_guardrail` & `apply_output_guardrail`**:
  - Pre-flight detection of direct, Tamil (`முந்தைய விதிகளை மறந்துவிடு`), Tanglish (`munthaiya vidhigalai maranthudu`), and base64-encoded prompt injections.
  - Bilingual (English, Tamil Unicode, and Tanglish) clinical red-flag escalation (`நெஞ்சு வலி`, `மயக்கம்`, `மூச்சுத்திணறல்`, `nenju vali`, `mayakkam`, `moochu thinaral`, `elumbu murivu`, pregnancy red flags, chest pain, syncope) injecting doctor/`மருத்துவர்`/`maruthuvar` guidance and `medical_note=True` if omitted by model replies.
  - Strict refusal of `<1000 kcal` crash diets, starvation/purging, and anabolic steroids / SARMs / clenbuterol requests across EN, Tamil, and Tanglish while avoiding false positives on calorie burn queries.
- **`redact_runtime_secrets`**: Extends `redact_sensitive_text` to scrub PostgreSQL/Redis/Mongo connection URIs, internal loopback/metadata URLs (`127.0.0.1`, `localhost`, `169.254.169.254`), and env secret dumps (`GEMINI_API_KEY=...`, `AI_SERVICE_JWT_SECRET=...`).
- **`strip_png_metadata` & `strip_image_metadata`**: Removes PNG metadata chunks (`tEXt`, `zTXt`, `iTXt`, `eXIf`, `tIME`) alongside JPEG EXIF stripping (`strip_jpeg_exif_metadata`), wired into Coach Chat, Coach Streaming, Multi-Agent Graph Executor, Meal Photo, and Multimodal Meal paths while safely passing truncated test stubs.

### Prompt, RAG, Streaming & MCP Hardening
- Updated [`coach_chat.py`](../../../ai-backend/src/onusfit_ai/features/coach/application/prompts/coach_chat.py), [`memory_extraction.py`](../../../ai-backend/src/onusfit_ai/features/coach/application/prompts/memory_extraction.py), and [`workout_planner.py`](../../../ai-backend/src/onusfit_ai/features/workout_planner/application/prompts/workout_planner.py) to sanitize memories, dialogue turns, limitations, RAG chunks, and adaptation feedback.
- Added English/Tamil/Tanglish red flags and Unicode/template injection patterns to [`workout_planner/domain/safety.py`](../../../ai-backend/src/onusfit_ai/features/workout_planner/domain/safety.py) and [`multi_agent/budgets.py`](../../../ai-backend/src/onusfit_ai/features/coach/application/multi_agent/budgets.py).
- Wired `assess_input_guardrail` and `apply_output_guardrail` into [`coach/application/chat.py`](../../../ai-backend/src/onusfit_ai/features/coach/application/chat.py), [`coach/domain/streaming.py`](../../../ai-backend/src/onusfit_ai/features/coach/domain/streaming.py), and chunk-level `sanitize_stream_delta` in [`shared/contracts/streaming.py`](../../../ai-backend/src/onusfit_ai/shared/contracts/streaming.py).
- Hardened [`McpSecurityGuardrails`](../../../ai-backend/src/onusfit_ai/features/mcp/application/security.py) to reject cross-user override keys (`user_id`, `userId`, `targetUserId`, `target_user_id`, `accountId`, `memberId`) even on unregistered tools, perform case-insensitive delimiter scrubbing and runtime secret masking in `sanitize_tool_output`, and sanitize prompt template arguments in [`McpToolRegistry.render_prompt`](../../../ai-backend/src/onusfit_ai/features/mcp/application/registry.py). Kept `persist_workout_plan` disabled by default without durable approval across `McpClientAdapter(include_write_tools=False)`, `MultiAgentMcpGateway(allow_mutations=False, durable_node_approval_verified=False)`, and `FitOnusMcpServer`.
- Hardened [`sanitizeUntrustedContent`](../../../backend/src/modules/knowledge/domain/rag-context-builder.ts) in Node with `stripControlChars` (avoiding control-regex lint issues), zero-width/bidi filtering, chat-template tag removal, and `DEVELOPER:` / `SYSTEM:` override redaction.

## 3. Dependency Vulnerability Remediation (`admin/` & Audits)

- **`admin/` (`admin/package.json`, `admin/package-lock.json`)**:
  - Updated `next` and `eslint-config-next` from `16.2.10` to `16.4.6` and ran `npm --prefix admin audit fix` (without `--force`).
  - Resolved all **6 runtime vulnerabilities** reported in Phase 19 (1 critical `next`, 4 high `postcss`/`sharp`/`nanoid`/`source-map-js`, 1 moderate `baseline-browser-mapping`) and all **17 total** lockfile advisories (1 critical, 8 high, 8 moderate).
  - Post-fix `npm --prefix admin audit --omit=dev` and full `npm --prefix admin audit` both report **0 vulnerabilities**.
- **`backend/`**: `npm --prefix backend audit --omit=dev` reports **0 vulnerabilities**.
- **`mobile/`**: `npm --prefix mobile audit --audit-level=high` exits **0** (0 critical/high; 14 moderate transitive Expo/ESLint advisories remain deferred because non-breaking `--audit-level=high` is clean and fixing `glob`/`minimatch` suggests `expo@52.0.49` via `--force`).

## 4. Security Benchmark Expansion & Verification Results

- Extended [`SecuritySafetyEvaluator`](../../../ai-backend/tests/evals/evaluators/security.py) with live probes covering `assess_input_guardrail`, `apply_output_guardrail`, `validate_stream_output_safety`, `sanitize_untrusted_text`, `redact_runtime_secrets`, `detect_medical_red_flags`, `McpSecurityGuardrails`, `McpClientAdapter`, `verify_service_token` + `ReplayCache`, and multimodal image/audio checks.
- Added **50 new benchmark cases** (`EVAL_SEC_019`–`EVAL_SEC_068`) in [`security_adversarial_benchmark.json`](../../../ai-backend/tests/evals/datasets/security_adversarial_benchmark.json) (68 total security cases; 451 total offline cases) and added unit tests in [`test_security_guardrails.py`](../../../ai-backend/tests/test_security_guardrails.py) and [`rag-context-builder.test.ts`](../../../backend/tests/unit/knowledge/rag-context-builder.test.ts).
- **Verified offline runs (`GEMINI_API_KEY=""`, zero live API calls)**:
  - `runner.py --baseline baseline_offline.json`: **451/451 passed (100.0%)**, `Regression Gate: PASSED`, `Critical Safety Failed: False` (`68/68` `security_adversarial`).
  - `pytest ai-backend/tests --ignore=ai-backend/tests/test_streaming_ai.py -q`: **1267 passed, 0 failed** (including `test_architecture.py` and `test_security_guardrails.py`).
  - **Phase 14 Streaming Import Note**: Prior to commit `e1db0c8` (`feat(ai): complete phase 14 streaming AI`), `ai-backend/tests/test_streaming_ai.py` failed test collection with an `ImportError` on `clear_settings_cache`. After `e1db0c8` landed on `development`, running `pytest ai-backend/tests/test_streaming_ai.py -q` independently passes **17/17**.
  - `mypy ai-backend/src`: **0 issues** across 179 source files; `ruff check` passed across `ai-backend/src` and touched test/eval files (pre-existing untracked `tests/evals/evaluators/judge.py` note: currently clean on `e1db0c8` or ignored where untouched).
  - `backend`: `tsc --noEmit` **passed**; scoped ESLint on touched knowledge files **0 errors**; Vitest (`tests/unit/knowledge/`, `tests/unit/coach/`, `tests/unit/ai/`) **46/46 files, 706/706 tests passed**.
  - `admin`: `tsc --noEmit` **passed**; `npm test` **299/299 passed** (50 suites); `npm run build` **passed** (Next.js 16.4.6); pre-existing `npm run lint` reports 36 issues (19 errors, 17 warnings) in untouched React hooks/tests.

## 5. Remaining Risks & Deferred Integration

- **Durable MCP Hitl/Persistence**: `persist_workout_plan` remains disabled (`include_write_tools=False` / `allow_mutations=False`, `durable_node_approval_verified=False`) until backed by a durable Node-side approval + transaction endpoint; the in-process `AgentToolOrchestrator` memory approval store is single-process only.
- **Per-Instance Stores**: Backend rate limiting (`ai-rate-limit.ts`) and Python `ReplayCache` remain in-memory per process; multi-replica production deployments require shared Redis/DB backing.
- **Deferred Live/DB Integration**: No live Gemini calls, live DB migrations, or deployments were executed per Phase 16 offline policy.

