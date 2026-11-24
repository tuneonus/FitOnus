# OnusFit Existing AI Engineering — Masterclass Learning Index

This index tracks all 32 AI Engineering topics already implemented across the OnusFit Python AI backend (`ai-backend`) and Node.js backend (`backend`).

> **Learning Status Legend:**
> - `NOT STARTED` : Topic identified and verified in codebase; not yet taught.
> - `LEARNING` : Currently active lesson being taught and reviewed.
> - `PRACTICED` : Practical exercise / inspection performed by student.
> - `COMPLETED` : Knowledge check passed and verified.

---

## 32 Existing AI Engineering Topics

| No | Topic | Status | Source Files | Tests | Learning Status |
|:---|:------|:-------|:-------------|:------|:----------------|
| **01** | [**Python FastAPI Architecture**](01-fastapi.md) | IMPLEMENTED | `ai-backend/src/onusfit_ai/main.py`<br>`ai-backend/src/onusfit_ai/features/`<br>`ai-backend/src/onusfit_ai/shared/` | `ai-backend/tests/test_architecture.py`<br>`ai-backend/tests/test_startup_and_logging.py`<br>`ai-backend/tests/test_health.py` | **COMPLETED** |
| **02** | [**Node.js ↔ Python AI Integration**](02-node-python-integration.md) | IMPLEMENTED | `backend/src/shared/ai/python-ai-client.ts`<br>`backend/src/shared/ai/python-ai-call.ts`<br>`backend/src/modules/coach/infrastructure/python-coach-chat-service.ts` | `backend/tests/unit/ai/python-ai-client.test.ts`<br>`backend/tests/unit/ai/python-wire-contract.test.ts`<br>`backend/tests/helpers/fake-python-ai-server.ts` | **COMPLETED** |
| **03** | [**Gemini API Integration**](03-gemini-api.md) | IMPLEMENTED | `ai-backend/src/onusfit_ai/shared/llm/gemini.py`<br>`ai-backend/src/onusfit_ai/shared/llm/ports.py`<br>`ai-backend/src/onusfit_ai/shared/llm/dependencies.py` | `ai-backend/tests/test_gemini_client.py` | **COMPLETED** |
| **04** | **Prompt Engineering** | IMPLEMENTED | `ai-backend/src/onusfit_ai/features/coach/application/prompts/`<br>`ai-backend/src/onusfit_ai/features/meals/application/prompts/`<br>`ai-backend/src/onusfit_ai/features/speech/application/prompts/` | `ai-backend/tests/test_coach_chat_prompt.py`<br>`ai-backend/tests/test_coach_insights_prompt.py`<br>`ai-backend/tests/test_meal_photo_prompt.py`<br>`ai-backend/tests/test_voice_meal_prompt.py` | **LEARNING** |
| **05** | **Dynamic User Context Engineering** | IMPLEMENTED | `backend/src/modules/coach/infrastructure/pg-user-context-repository.ts`<br>`ai-backend/src/onusfit_ai/features/coach/domain/chat.py` | `backend/tests/unit/coach/coach-use-case.test.ts`<br>`ai-backend/tests/test_coach_prompt_safety.py` | NOT STARTED |
| **06** | **AI Coach Chat** | IMPLEMENTED | `backend/src/modules/coach/application/use-cases/chat-with-coach.ts`<br>`ai-backend/src/onusfit_ai/features/coach/presentation/coach_chat.py`<br>`ai-backend/src/onusfit_ai/features/coach/application/chat.py` | `backend/tests/unit/coach/coach-chat-python-integration.test.ts`<br>`ai-backend/tests/test_coach_chat_api.py`<br>`ai-backend/tests/test_coach_chat_parsing.py` | NOT STARTED |
| **07** | **AI Coach Insights** | IMPLEMENTED | `backend/src/modules/coach/application/use-cases/get-coach-insights.ts`<br>`ai-backend/src/onusfit_ai/features/coach/presentation/coach_insights.py`<br>`ai-backend/src/onusfit_ai/features/coach/application/insights.py` | `backend/tests/unit/coach/coach-insights-fallback.test.ts`<br>`ai-backend/tests/test_coach_insights_api.py`<br>`ai-backend/tests/test_coach_insights_parsing.py` | NOT STARTED |
| **08** | **Multimodal Vision — Meal Photo** | IMPLEMENTED | `backend/src/modules/nutrition/application/use-cases/analyze-meal-photo.ts`<br>`ai-backend/src/onusfit_ai/features/meals/presentation/meal_photo.py`<br>`ai-backend/src/onusfit_ai/features/meals/application/photo.py` | `backend/tests/unit/nutrition/meal-photo-python-integration.test.ts`<br>`ai-backend/tests/test_meal_photo_api.py`<br>`ai-backend/tests/test_meal_photo_parsing.py` | NOT STARTED |
| **09** | **Multimodal Audio — Voice Meal** | IMPLEMENTED | `backend/src/modules/nutrition/application/use-cases/parse-voice-meal.ts`<br>`ai-backend/src/onusfit_ai/features/meals/presentation/voice_meal.py`<br>`ai-backend/src/onusfit_ai/features/meals/application/voice.py` | `backend/tests/unit/nutrition/voice-meal-python-integration.test.ts`<br>`ai-backend/tests/test_voice_meal_api.py`<br>`ai-backend/tests/test_voice_meal_parsing.py` | NOT STARTED |
| **10** | **Speech Transcription** | IMPLEMENTED | `backend/src/modules/coach/infrastructure/python-speech-transcriber.ts`<br>`ai-backend/src/onusfit_ai/features/speech/presentation/transcribe.py`<br>`ai-backend/src/onusfit_ai/features/speech/application/transcribe.py` | `backend/tests/unit/coach/python-speech-transcriber.test.ts`<br>`ai-backend/tests/test_transcribe_api.py`<br>`ai-backend/tests/test_transcribe_parsing.py` | NOT STARTED |
| **11** | **Pydantic Validation** | IMPLEMENTED | `ai-backend/src/onusfit_ai/shared/contracts/_base.py`<br>`ai-backend/src/onusfit_ai/features/*/domain/` | `ai-backend/tests/test_wire_contract.py`<br>`ai-backend/tests/test_meal_sanitize.py` | NOT STARTED |
| **12** | **Node.js Zod Validation** | IMPLEMENTED | `backend/src/modules/coach/interface/coach.schemas.ts`<br>`backend/src/modules/nutrition/interface/meal-photo.schemas.ts`<br>`backend/src/modules/nutrition/interface/voice-meal.schemas.ts` | `backend/tests/unit/coach/coach-http.test.ts`<br>`backend/tests/unit/nutrition/nutrition-http.test.ts` | NOT STARTED |
| **13** | **Gemini Model Fallback** | IMPLEMENTED | `ai-backend/src/onusfit_ai/shared/llm/gemini.py`<br>`ai-backend/src/onusfit_ai/shared/llm/errors.py`<br>`backend/src/shared/ai/model-cooldown-tracker.ts` | `ai-backend/tests/test_gemini_client.py`<br>`backend/tests/unit/ai/model-cooldown-tracker.test.ts` | NOT STARTED |
| **14** | **Admin Gemini Configuration** | IMPLEMENTED | `backend/src/modules/app-settings/application/use-cases/update-gemini-config.ts`<br>`backend/src/modules/app-settings/application/services/gemini-runtime-service.ts` | `backend/tests/unit/app-settings/gemini-ai-management.test.ts`<br>`backend/tests/unit/app-settings/gemini-model-names.test.ts` | NOT STARTED |
| **15** | **Gemini API Key Management** | IMPLEMENTED | `backend/src/modules/app-settings/application/use-cases/rollback-gemini-key.ts`<br>`backend/src/modules/app-settings/application/use-cases/test-gemini-connection.ts` | `backend/tests/unit/app-settings/gemini-test-connection.test.ts` | NOT STARTED |
| **16** | **Token Usage Tracking** | IMPLEMENTED | `ai-backend/src/onusfit_ai/shared/llm/telemetry.py`<br>`backend/src/modules/app-settings/infrastructure/pg-app-settings-repository.ts` | `backend/tests/integration/repositories/ai-telemetry.test.ts`<br>`ai-backend/tests/test_observability.py` | NOT STARTED |
| **17** | **AI Cost Estimation** | IMPLEMENTED | `backend/src/modules/app-settings/application/services/gemini-runtime-service.ts`<br>`backend/src/modules/app-settings/infrastructure/pg-app-settings-repository.ts` (`gemini_pricing`) | `backend/tests/unit/app-settings/gemini-ai-management.test.ts` | NOT STARTED |
| **18** | **AI Quota Management** | IMPLEMENTED | `backend/src/shared/ai/ai-usage.ts`<br>`backend/src/modules/app-settings/application/services/ai-usage-gate.ts`<br>`backend/src/modules/app-settings/application/use-cases/check-and-record-ai-quota.ts` | `backend/tests/unit/ai/ai-use-case-gating.test.ts`<br>`backend/tests/unit/app-settings/ai-usage-gate.test.ts`<br>`backend/tests/integration/repositories/ai-usage.test.ts` | NOT STARTED |
| **19** | **JWT Authentication (User)** | IMPLEMENTED | `backend/src/modules/auth/infrastructure/jose-access-token-service.ts`<br>`backend/src/middleware/authenticate.ts` | `backend/tests/unit/auth/` | NOT STARTED |
| **20** | **Service-to-Service JWT Auth** | IMPLEMENTED | `backend/src/shared/ai/python-ai-client.ts`<br>`ai-backend/src/onusfit_ai/shared/auth/auth.py` | `ai-backend/tests/test_auth.py`<br>`backend/tests/unit/ai/python-ai-client.test.ts` | NOT STARTED |
| **21** | **Gemini Key AES-256 Encryption** | IMPLEMENTED | `backend/src/shared/security/encryption.js`<br>`backend/src/modules/app-settings/application/use-cases/update-gemini-config.ts` | `backend/tests/unit/app-settings/gemini-ai-management.test.ts` | NOT STARTED |
| **22** | **PostgreSQL AI Persistence** | IMPLEMENTED | `backend/migrations/0013_create_coach_conversations_and_memories.sql`<br>`backend/migrations/0014_create_app_settings.sql` | `backend/tests/integration/repositories/coach-messages.test.ts` | NOT STARTED |
| **23** | **AI Conversation History** | IMPLEMENTED | `backend/src/modules/coach/application/use-cases/manage-conversations.ts`<br>`backend/src/modules/coach/infrastructure/pg-conversation-repository.ts` | `backend/tests/unit/coach/coach-history.test.ts` | NOT STARTED |
| **24** | **Basic AI Memory Storage** | IMPLEMENTED | `backend/src/modules/coach/application/use-cases/manage-memories.ts`<br>`backend/src/modules/coach/infrastructure/pg-memory-repository.ts` | `backend/tests/unit/coach/coach-memory.test.ts` | NOT STARTED |
| **25** | **Structured JSON Logging** | IMPLEMENTED | `ai-backend/src/onusfit_ai/shared/logging/logging.py`<br>`ai-backend/src/onusfit_ai/shared/observability/observability.py` | `ai-backend/tests/test_startup_and_logging.py`<br>`ai-backend/tests/test_observability.py` | NOT STARTED |
| **26** | **Request Correlation IDs** | IMPLEMENTED | `backend/src/shared/ai/python-ai-client.ts`<br>`ai-backend/src/onusfit_ai/shared/observability/observability.py` | `backend/tests/unit/ai/request-correlation.test.ts`<br>`ai-backend/tests/test_observability.py` | NOT STARTED |
| **27** | **Docker Containerization** | IMPLEMENTED | `ai-backend/Dockerfile`<br>`backend/Dockerfile` | `ai-backend.yml`<br>`ci.yml` | NOT STARTED |
| **28** | **GitHub Actions CI** | IMPLEMENTED | `.github/workflows/ai-backend.yml`<br>`.github/workflows/ci.yml` | CI Automated Runner | NOT STARTED |
| **29** | **Python AI Unit & Contract Tests** | IMPLEMENTED | `ai-backend/tests/` (30 test suites, 600 passing tests) | `pytest ai-backend/tests` | NOT STARTED |
| **30** | **Node.js AI Integration Tests** | IMPLEMENTED | `backend/tests/unit/ai/`<br>`backend/tests/unit/coach/`<br>`backend/tests/unit/nutrition/` | `npm --prefix backend test` | NOT STARTED |
| **31** | **Clean / Hexagonal Architecture** | IMPLEMENTED | `ai-backend/src/onusfit_ai/features/` (`presentation`, `application`, `domain`, `infrastructure`) | `ai-backend/tests/test_architecture.py` | NOT STARTED |
| **32** | **Basic AI Rate Limiting** | IMPLEMENTED | `backend/src/shared/ai/ai-rate-limit.ts`<br>`backend/src/modules/app-settings/application/services/ai-usage-gate.ts` | `backend/tests/unit/ai/ai-rate-limit.test.ts`<br>`backend/tests/integration/http/ai-rate-limit.http.test.ts` | NOT STARTED |

---

## Phase 02: Advanced Gemini Function Calling & Autonomous Agents

| Stage | Guide | Status | Core Implementation Files | Tests |
|:---|:---|:---|:---|:---|
| **P2-S01** | [**Stage 01: Secure Internal Tool API & Declarations**](../phase-02-stage-01-function-calling-tools.md) | **COMPLETED** | `backend/src/modules/coach/interface/internal-tools.*`<br>`ai-backend/src/onusfit_ai/features/coach/application/tools.py` | `backend/tests/unit/coach/internal-tools-*.test.ts`<br>`ai-backend/tests/test_coach_tools.py` |
| **P2-S02** | [**Stage 02: Multi-Turn Function Calling Loop**](../phase-02-stage-02-multi-turn-function-calling.md) | **COMPLETED** | `ai-backend/src/onusfit_ai/shared/llm/gemini.py`<br>`ai-backend/src/onusfit_ai/shared/llm/ports.py`<br>`ai-backend/src/onusfit_ai/features/coach/application/tools.py` | `ai-backend/tests/test_gemini_tools_loop.py`<br>`ai-backend/tests/test_gemini_client.py` |
| **P2-S03** | [**Stage 03: AI Coach Integration & Observability**](../phase-02-stage-03-coach-chat-tools.md) | **COMPLETED** | `ai-backend/src/onusfit_ai/features/coach/`<br>`ai-backend/src/onusfit_ai/shared/tools/`<br>`backend/src/modules/coach/infrastructure/python-coach-chat-service.ts` | `ai-backend/tests/test_coach_chat_tools_integration.py`<br>`backend/tests/unit/coach/coach-chat-python-integration.test.ts` |

---

## Phase 03: AI Evaluation Foundation

| Stage | Guide | Status | Core Implementation Files | Tests |
|:---|:---|:---|:---|:---|
| **P3-All** | [**Phase 03: AI Evaluation Foundation Master Guide**](../phase-03-ai-evaluation-foundation.md) | **COMPLETED** | `ai-backend/tests/evals/offline/*`<br>`ai-backend/tests/evals/datasets/*`<br>`ai-backend/tests/evals/evaluators/*`<br>`ai-backend/tests/evals/runner.py`<br>`ai-backend/tests/evals/reporter.py`<br>`.github/workflows/ai-backend.yml` | `ai-backend/tests/evals/` (50 passed, 66 golden benchmark cases) |

---

## Phase 04: Gemini Vector Embeddings, Semantic Text Chunking & Ingestion

| Stage | Guide | Status | Core Implementation Files | Tests |
|:---|:---|:---|:---|:---|
| **P4-All** | [**Phase 04: Gemini Vector Embeddings & Chunking Guide**](../phase-04-gemini-embeddings-and-chunking.md) | **COMPLETED** | `ai-backend/src/onusfit_ai/features/knowledge/*`<br>`ai-backend/src/onusfit_ai/shared/llm/ports.py`<br>`ai-backend/src/onusfit_ai/shared/llm/gemini.py`<br>`backend/src/shared/ai/python-ai-client.ts` | `ai-backend/tests/test_embed_api.py`<br>`ai-backend/tests/test_gemini_embed.py`<br>`ai-backend/tests/test_knowledge_chunking.py`<br>`backend/tests/unit/ai/python-ai-client-embed.test.ts` |

---

## Phase 05: Vector Database & pgvector Integration

| Stage | Guide | Status | Core Implementation Files | Tests |
|:---|:---|:---|:---|:---|
| **P5-All** | [**Phase 05: Vector Database & pgvector Guide**](../phase-05-vector-database-and-pgvector.md) | **COMPLETED** | `backend/migrations/0029_create_vector_extension_and_knowledge_base.sql`<br>`backend/src/modules/knowledge/*`<br>`backend/scripts/seed-knowledge.ts` | `backend/tests/unit/database/knowledge-migration.test.ts`<br>`backend/tests/unit/knowledge/semantic-chunker.test.ts`<br>`backend/tests/unit/knowledge/pg-knowledge-repository.test.ts`<br>`backend/tests/unit/knowledge/knowledge-service.test.ts` |

---

## Phase 06: Advanced RAG & AI Coach Grounding

| Stage | Guide | Status | Core Implementation Files | Tests |
|:---|:---|:---|:---|:---|
| **P6-All** | [**Phase 06: Advanced RAG & AI Coach Grounding**](../phase-06-advanced-rag-and-grounding.md) | **COMPLETED** | `backend/migrations/0030_create_knowledge_fulltext_index.sql`<br>`backend/src/modules/knowledge/domain/reciprocal-rank-fusion.ts`<br>`backend/src/modules/knowledge/domain/rag-context-builder.ts`<br>`ai-backend/src/onusfit_ai/features/coach/application/prompts/coach_chat.py` | `backend/tests/unit/knowledge/reciprocal-rank-fusion.test.ts`<br>`backend/tests/unit/knowledge/hybrid-retrieval.test.ts`<br>`backend/tests/unit/knowledge/rag-context-builder.test.ts`<br>`backend/tests/unit/coach/coach-chat-rag-integration.test.ts`<br>`ai-backend/tests/evals/test_rag_evaluation.py` |

---

## Phase 06.5: Admin Knowledge Management & Production Hardening

| Stage | Guide | Status | Core Implementation Files | Tests |
|:---|:---|:---|:---|:---|
| **P6.5-All** | [**Phase 06.5: Admin Knowledge Management Hardening**](../phase-06.5-admin-knowledge-management.md) | **COMPLETED** | `backend/migrations/0031_add_knowledge_document_lifecycle.sql`<br>`backend/src/modules/knowledge/interface/text-extractor.ts`<br>`backend/src/modules/knowledge/infrastructure/pg-knowledge-repository.ts`<br>`backend/src/modules/knowledge/application/knowledge-service.ts`<br>`backend/src/modules/knowledge/interface/knowledge-admin.*`<br>`admin/src/features/knowledge/*` | `backend/tests/unit/knowledge/text-extractor.test.ts`<br>`backend/tests/unit/knowledge/knowledge-admin.controller.test.ts`<br>`backend/tests/unit/knowledge/pg-knowledge-repository.test.ts`<br>`backend/tests/unit/knowledge/knowledge-service.test.ts`<br>`admin/tests/admin-knowledge.test.ts` |

---

## Phase 07: AI Memory Systems

| Stage | Guide | Status | Core Implementation Files | Tests |
|:---|:---|:---|:---|:---|
| **P7-All** | [**Phase 07: AI Memory Systems**](../phase-07-ai-memory-systems.md) | **COMPLETED** | `backend/migrations/0033_harden_ai_memory_consent_and_metadata.sql`<br>`backend/src/modules/coach/domain/history-budget.ts`<br>`backend/src/modules/coach/infrastructure/pg-memory-job-queue.ts`<br>`backend/src/modules/coach/infrastructure/python-memory-extractor.ts`<br>`backend/src/modules/coach/application/services/memory-extraction-worker.ts`<br>`ai-backend/src/onusfit_ai/features/coach/domain/memory.py`<br>`ai-backend/src/onusfit_ai/features/coach/application/extraction.py`<br>`mobile/src/features/ai-memory/*` | `backend/tests/unit/coach/coach-history.test.ts`<br>`backend/tests/unit/coach/history-budget.test.ts`<br>`backend/tests/unit/database/memory-migration.test.ts`<br>`backend/tests/unit/coach/coach-memory.test.ts`<br>`backend/tests/unit/coach/pg-memory-job-queue.test.ts`<br>`backend/tests/unit/coach/memory-extraction-worker.test.ts`<br>`ai-backend/tests/test_memory_extraction.py`<br>`ai-backend/tests/evals/offline/test_memory_eval.py`<br>`mobile/tests/coach-chat.test.ts` |

---

## Phase 08: Context Engineering

| Stage | Guide | Status | Core Implementation Files | Tests |
|:---|:---|:---|:---|:---|
| **P8-All** | [**Phase 08: Context Engineering**](../phase-08-context-engineering.md) | **COMPLETED** | `backend/src/modules/coach/domain/intent-router.ts`<br>`backend/src/modules/coach/domain/context-deduplicator.ts`<br>`backend/src/modules/coach/domain/context-budget.ts`<br>`backend/src/modules/coach/application/services/context-assembler.ts`<br>`ai-backend/src/onusfit_ai/features/coach/application/prompts/coach_chat.py`<br>`ai-backend/tests/evals/evaluators/context.py` | `backend/tests/unit/coach/intent-router.test.ts`<br>`backend/tests/unit/coach/context-deduplicator.test.ts`<br>`backend/tests/unit/coach/context-budget.test.ts`<br>`backend/tests/unit/coach/context-assembler.test.ts`<br>`backend/tests/unit/coach/coach-chat-rag-integration.test.ts`<br>`ai-backend/tests/test_context_hardening.py`<br>`ai-backend/tests/evals/offline/test_context_eval.py`<br>`ai-backend/tests/evals/test_runner.py` |

---

## Phase 09: AI Agent Fundamentals

| Stage | Guide | Status | Core Implementation Files | Tests |
|:---|:---|:---|:---|:---|
| **P9-All** | [**Phase 09: AI Agent Fundamentals**](../phase-09-ai-agent-fundamentals.md) | **COMPLETED** | `ai-backend/src/onusfit_ai/features/coach/domain/agent.py`<br>`ai-backend/src/onusfit_ai/features/coach/application/agent/planner.py`<br>`ai-backend/src/onusfit_ai/features/coach/application/agent/observer.py`<br>`ai-backend/src/onusfit_ai/features/coach/application/agent/executor.py`<br>`ai-backend/src/onusfit_ai/features/coach/application/chat.py`<br>`ai-backend/src/onusfit_ai/features/coach/presentation/coach_chat.py`<br>`ai-backend/tests/evals/evaluators/agent.py` | `ai-backend/tests/test_agent_contracts.py`<br>`ai-backend/tests/test_agent_planner.py`<br>`ai-backend/tests/test_agent_observation.py`<br>`ai-backend/tests/test_agent_executor.py`<br>`ai-backend/tests/evals/offline/test_agent_eval.py`<br>`ai-backend/tests/evals/test_runner.py` |

---

## Phase 10: LangGraph Agent Workflows

| Stage | Guide | Status | Core Implementation Files | Tests |
|:---|:---|:---|:---|:---|
| **P10-All** | [**Phase 10: LangGraph Agent Workflows**](../phase-10-langgraph-agent-workflows.md) | **COMPLETED** | `ai-backend/src/onusfit_ai/features/coach/application/agent/graph/state.py`<br>`ai-backend/src/onusfit_ai/features/coach/application/agent/graph/nodes.py`<br>`ai-backend/src/onusfit_ai/features/coach/application/agent/graph/routing.py`<br>`ai-backend/src/onusfit_ai/features/coach/application/agent/graph/builder.py`<br>`ai-backend/src/onusfit_ai/features/coach/application/agent/graph/executor.py`<br>`ai-backend/src/onusfit_ai/features/coach/application/agent/graph/telemetry.py`<br>`ai-backend/tests/evals/evaluators/langgraph.py` | `ai-backend/tests/test_langgraph_contracts.py`<br>`ai-backend/tests/test_langgraph_nodes_and_routing.py`<br>`ai-backend/tests/test_langgraph_workflow.py`<br>`ai-backend/tests/test_langgraph_parity.py`<br>`ai-backend/tests/evals/offline/test_langgraph_eval.py` |
