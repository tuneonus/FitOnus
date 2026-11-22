# OnusFit — Prioritized AI Engineering Implementation Roadmap

**Author:** Senior AI Architect, Full Stack AI Engineer, GenAI Engineer, AI Agent Engineer & Production Reviewer  
**Date:** November 2026  
**Companion Document:** `ONUSFIT_AI_ENGINEERING_AUDIT.md`  
**Guiding Principles:**
1. **Additive & Non-Breaking:** Production mobile and web flows continue operating uninterrupted.
2. **Zero Theoretical Bloat:** Every technology directly powers a concrete fitness or nutrition feature.
3. **Cost-Efficiency First:** Prioritize free/low-cost foundation tiers (Gemini 2.5 Flash / Flash Lite, local pgvector in existing PostgreSQL, open-source tooling) over expensive third-party SaaS.
4. **Verifiable Portfolio Artifacts:** Every phase concludes with measurable acceptance criteria, automated tests, and interview talking points with concrete metrics.

---

## Roadmap Overview & Dependency Graph

```
Phase 1: Native Structured Outputs & SSE Streaming
   │
   ▼
Phase 2: RAG Foundation with pgvector & Grounding
   │
   ▼
Phase 3: Agent Tool Calling & Semantic Memory
   │
   ▼
Phase 4: LangGraph Multi-Turn Workout Planner (Human-in-the-Loop)
   │
   ▼
Phase 5: Model Context Protocol (MCP) Integration
   │
   ▼
Phase 6: Automated AI Evaluation Pipeline (CI/CD Gates)
   │
   ▼
Phase 7: End-to-End Tracing (Langfuse/OTel) & Guardrails
   │
   ▼
Phase 8: Async Worker Infrastructure & AgentOps Hardening
```

---

## Phase 1: Native Structured Outputs, Prompt Architecture & True Streaming (SSE)

### 1. Objective
Eliminate brittle regex/fence string parsing by enforcing native Gemini JSON Schema outputs via Pydantic, modernize system prompt delivery via `system_instruction`, implement true Server-Sent Events (SSE) streaming from Python through Node to the Expo mobile client, and fix the mobile chat history dynamic navigation.

### 2. Features to Implement
- **Native JSON Schema Enforcement:** Pass Pydantic schemas to `types.GenerateContentConfig(response_schema=..., response_mime_type="application/json")`.
- **System Instruction Isolation:** Move concatenated prompt headers to Gemini's native `system_instruction` parameter.
- **Server-Sent Events (SSE) Streaming:** Replace synchronous blocking HTTP calls on `POST /coach/chat` with real-time token streaming (`generate_content_stream`).
- **Dynamic Mobile Chat History:** Wire Expo Router dynamic route `mobile/src/app/(tabs)/coach/[id].tsx` so tapping past conversations loads their message threads.

### 3. Existing Files to Reuse
- `ai-backend/src/onusfit_ai/shared/llm/gemini.py`
- `ai-backend/src/onusfit_ai/features/coach/domain/chat.py`
- `ai-backend/src/onusfit_ai/features/meals/domain/photo.py`
- `backend/src/modules/coach/interface/coach.routes.ts`
- `mobile/src/features/coach/hooks/use-chat.ts`
- `mobile/src/app/(tabs)/coach/history.tsx`

### 4. New Files or Modules Required
- `ai-backend/src/onusfit_ai/features/coach/presentation/coach_chat_stream.py` (FastAPI EventSourceResponse endpoint)
- `backend/src/modules/coach/interface/coach-stream.controller.ts` (Express SSE relay handler)
- `mobile/src/app/(tabs)/coach/[id].tsx` (Expo Router dynamic conversation view)
- `mobile/src/features/coach/services/sse-client.ts` (React Native SSE reader using `fetch` with streaming response)

### 5. Recommended Technologies
- Python: `google-genai` SDK (`client.aio.models.generate_content_stream`), `sse-starlette`
- Node.js: Express native SSE (`res.setHeader('Content-Type', 'text/event-stream')`)
- Mobile: `react-native-sse` or `expo/fetch` streaming reader

### 6. Dependencies
None (uses existing packages; add `sse-starlette` to `ai-backend`).

### 7. Implementation Order
1. Update `GeminiClient._call` in `gemini.py` to accept `response_schema: type[BaseModel] | None` and `system_instruction: str | None`.
2. Migrate `features/meals/` (photo and voice) to use `response_schema`, deprecating `photo_parsing.py` regex workarounds.
3. Implement `generate_content_stream` in `gemini.py` and mount `POST /internal/v1/ai/coach/chat/stream`.
4. Add Express SSE route in `backend/src/modules/coach/interface/coach.routes.ts`.
5. Update `mobile/src/features/coach/hooks/use-chat.ts` to consume SSE stream chunks.
6. Create `mobile/src/app/(tabs)/coach/[id].tsx` and connect `history.tsx` onPress.

### 8. Testing Requirements
- Unit tests: verify Pydantic schema generation and stream chunk decoding.
- Contract test: verify SSE event format (`event: delta`, `event: done`, `event: error`).
- Mobile integration test: verify live token rendering without UI stutter.

### 9. Acceptance Criteria
- 0% JSON parse error rate across 100 test meal photos and voice transcripts.
- Time-to-First-Token (TTFT) in mobile chat drops from ~8,000ms to < 1,200ms.
- Selecting any conversation from chat history loads the correct thread.

### 10. Estimated Effort
1.5 to 2 weeks (15–20 engineering hours).

### 11. Resume and Interview Relevance
Demonstrates mastery of LLM structured outputs (JSON Schema vs. prompt-based JSON) and real-time streaming architectures across distributed microservices.

---

## Phase 2: RAG Foundation with pgvector & Hybrid Grounding

### 2.1 Objective
Build a production-grade Retrieval-Augmented Generation (RAG) system utilizing `pgvector` inside the existing PostgreSQL 17 database. Ground exercise biomechanics, injury modifications, and nutritional estimates in verified, authoritative domain knowledge.

### 2.2 Features to Implement
- **pgvector Extension & Knowledge Base Schema:** Migration adding vector support and tables for document chunks and exercise embeddings.
- **Document Ingestion & Chunking Pipeline:** Automated ingestion of evidence-based fitness guidelines (ACSM guidelines, ISSN sports nutrition position stands) using recursive character text chunking with metadata extraction.
- **Embedding Generation:** Integration with Gemini `text-embedding-004` (768 dimensions).
- **Hybrid Retrieval Engine:** Combine dense vector cosine similarity (`<=>`) with sparse trigram matching (`pg_trgm`) via Reciprocal Rank Fusion (RRF).
- **Verified Food DB Grounding:** Query `food_items` table (5,000+ items) to ground meal photo and voice meal estimates in verified nutrition values.

### 2.3 Existing Files to Reuse
- `backend/migrations/`
- `backend/src/modules/workouts/domain/exercise.ts`
- `backend/src/modules/nutrition/infrastructure/pg-food-repository.ts`
- `backend/src/database/transaction.ts`
- `ai-backend/src/onusfit_ai/shared/llm/gemini.py`

### 2.4 New Files or Modules Required
- `backend/migrations/0029_create_vector_extension_and_knowledge_base.sql`
- `ai-backend/src/onusfit_ai/features/rag/domain/documents.py`
- `ai-backend/src/onusfit_ai/features/rag/application/ingestion.py`
- `ai-backend/src/onusfit_ai/features/rag/application/retrieval.py`
- `ai-backend/src/onusfit_ai/features/rag/infrastructure/pgvector_store.py`
- `ai-backend/src/onusfit_ai/features/rag/presentation/rag_routes.py`
- `backend/scripts/ingest-fitness-knowledge.ts`

### 2.5 Recommended Technologies
- PostgreSQL `pgvector` extension (HNSW index: `vector_cosine_ops`)
- Embedding Model: Gemini `text-embedding-004`
- Chunking: LangChain / LlamaIndex text splitters (or custom semantic boundary chunker)
- Reranking: FlashRank (lightweight, zero-cost, local in-memory cross-encoder)

### 2.6 Dependencies
- `pgvector` extension enabled in PostgreSQL container.
- Python dependencies: `flashrank>=0.2.0`, `pgvector>=0.3.0`.

### 2.7 Implementation Order
1. Update `backend/compose.yaml` to use a pgvector-enabled image (`pgvector/pgvector:pg17`).
2. Author Migration `0029` creating `rag_knowledge_chunks` and `exercise_embeddings` with HNSW cosine indexes.
3. Create document ingestion script parsing markdown/PDF fitness guidelines into 500-token chunks with 50-token overlap.
4. Build embedding generator in Python calling `client.aio.models.embed_content(model="text-embedding-004")`.
5. Implement Hybrid Retrieval query combining vector distance and trigram match score.
6. Connect RAG retrieval to Coach Chat prompt: inject retrieved scientific citations into prompt context.

### 2.8 Testing Requirements
- Database integration test: verify HNSW index creation and nearest-neighbor vector search.
- Ingestion unit test: verify chunk size boundaries and metadata preservation.
- Retrieval benchmark test: verify recall on 20 query-to-document ground-truth pairs.

### 2.9 Acceptance Criteria
- Nearest-neighbor query latency < 35ms on 10,000 vectors with HNSW index.
- Coach Chat answers to injury queries include source citations (e.g., `[ACSM Resistance Training Guidelines §4.2]`).
- Voice and meal photo macros match verified database foods within a 5% margin.

### 2.10 Estimated Effort
3 weeks (25–30 engineering hours).

### 2.11 Resume and Interview Relevance
Demonstrates real-world RAG engineering: hybrid search (dense + sparse), custom HNSW index tuning, reranking, and citation-backed hallucination mitigation in health tech.

---

## Phase 3: Native Tool Calling & Semantic Long-Term Memory

### 3.1 Objective
Transform the single-shot completion flow into an autonomous agent capable of executing tools against user fitness records, and replace naive `LIMIT 15` memory retrieval with vector-indexed semantic recall and automated fact extraction.

### 3.2 Features to Implement
- **Gemini Native Function Calling:** Declare tools in Gemini API format (`types.Tool`) allowing the model to request user data or stage actions.
- **Tool Suite Implementation:**
  - `get_workout_history(days: int)`: reads recent volume and personal records.
  - `get_nutrition_summary(date: str)`: checks macro targets and caloric balance.
  - `search_exercise_catalog(query: str, muscle: str, equipment: list[str])`: finds matching exercises.
- **Automated Memory Extraction:** Asynchronous pipeline extracting atomic user facts ("recovering from rotator cuff tear", "prefers plant-based protein") from conversations.
- **Semantic Memory Search:** Vector similarity retrieval matching user queries against stored memories.

### 3.3 Existing Files to Reuse
- `ai-backend/src/onusfit_ai/features/coach/domain/chat.py`
- `backend/src/modules/coach/infrastructure/pg-memory-repository.ts`
- `backend/src/modules/coach/application/use-cases/chat-with-coach.ts`
- `backend/migrations/0013_create_coach_conversations_and_memories.sql`

### 3.4 New Files or Modules Required
- `ai-backend/src/onusfit_ai/features/coach/application/tools.py` (Gemini tool definitions and dispatcher)
- `backend/migrations/0030_add_memory_vector_embeddings.sql` (Add `embedding vector(768)` to `coach_memories`)
- `ai-backend/src/onusfit_ai/features/coach/application/memory_extraction.py` (Fact extraction prompt + parser)
- `backend/src/modules/coach/interface/internal-tools.routes.ts` (Internal signed API endpoints for agent data access)

### 3.5 Recommended Technologies
- Google GenAI SDK function declarations (`types.FunctionDeclaration`, `types.Tool`)
- Pydantic tool parameter schemas
- Gemini `text-embedding-004` for memory vectorization

### 3.6 Dependencies
Phase 1 (Structured Outputs) and Phase 2 (pgvector).

### 3.7 Implementation Order
1. Apply Migration `0030` adding `embedding vector(768)` and HNSW index to `coach_memories`.
2. Define tool schemas in Python (`tools.py`) and wire execution handlers back to Node API via signed internal tool calls.
3. Update `gemini.py` to support multi-turn function calling loops (Model Call → Tool Request → Tool Execution → Final Answer).
4. Implement background memory extraction trigger: after conversation reaches 6 turns, extract atomic preferences and embed them.
5. Update `chat-with-coach.ts` to retrieve top-5 relevant memories via cosine similarity with user query.

### 3.8 Testing Requirements
- Unit test: tool schema validation against Gemini API constraints.
- Integration test: verify agent multi-turn execution loop (model requests `get_workout_history`, receives payload, formulates final response).
- Memory retrieval test: verify query "Can I do bench press?" retrieves "rotator cuff injury" memory over unrelated "likes oats" memory.

### 3.9 Acceptance Criteria
- Agent correctly chooses and executes tools with > 95% tool-selection accuracy on test scenarios.
- Only semantically relevant memories are injected into prompt context.
- Extraction pipeline successfully stores new user facts into `coach_memories` with valid embeddings.

### 3.10 Estimated Effort
3 weeks (25–30 engineering hours).

### 3.11 Resume and Interview Relevance
Demonstrates mastery of native LLM tool/function calling, ReAct loops, tool parameter validation, and semantic long-term agent memory architectures.

---

## Phase 4: LangGraph Multi-Turn Adaptive Workout Planning (Human-in-the-Loop)

### 4.1 Objective
Replace the hardcoded client-side JS filtering in `workoutPlanGenerator.ts` with an autonomous, production-grade 4-node LangGraph agent state machine in Python. Implement human-in-the-loop review, state persistence, and adaptive periodization.

### 4.2 Features to Implement
- **LangGraph State Machine (`WorkoutPlannerGraph`):**
  - **Node 1: Athlete Volume Assessor:** Evaluates historical load, fatigue, and recovery metrics.
  - **Node 2: Periodization & Exercise Selector:** Selects exercises applying progressive overload principles and biomechanical balance.
  - **Node 3: Safety & Injury Constraint Validator:** Validates selections against user injury memories and equipment availability.
  - **Node 4: Human-in-the-Loop Approval Node:** Interrupts execution, presents structured plan to user, and waits for user approval/modification before committing to PostgreSQL.
- **Checkpoints & State Persistence:** Persist graph execution state in PostgreSQL using LangGraph checkpointer.
- **Full Backend Integration:** Expose `POST /api/v1/workouts/generate-plan` in Node with quota enforcement, dispatching to LangGraph in Python.

### 4.3 Existing Files to Reuse
- `mobile/src/features/workouts/screens/WorkoutGeneratorScreen.tsx`
- `mobile/src/features/workouts/types/workout.ts`
- `backend/src/modules/workouts/interface/workouts.routes.ts`
- `backend/src/modules/workouts/infrastructure/pg-workout-repository.ts`

### 4.4 New Files or Modules Required
- `ai-backend/src/onusfit_ai/features/workouts/domain/state.py` (LangGraph state schema)
- `ai-backend/src/onusfit_ai/features/workouts/application/graph.py` (LangGraph state graph definition)
- `ai-backend/src/onusfit_ai/features/workouts/application/nodes/*.py` (Individual graph nodes)
- `ai-backend/src/onusfit_ai/features/workouts/presentation/workout_routes.py` (FastAPI graph trigger & resume endpoints)
- `backend/src/modules/workouts/application/use-cases/generate-ai-workout-plan.ts`

### 4.5 Recommended Technologies
- LangGraph (`langgraph>=0.2.0`, `langchain-core`)
- LangGraph Postgres Checkpointer (`langgraph-checkpoint-postgres`)
- Gemini 2.5 Flash as the underlying reasoning LLM

### 4.6 Dependencies
Phase 1 (Structured Outputs), Phase 2 (RAG exercise knowledge), Phase 3 (Tools).

### 4.7 Implementation Order
1. Define `WorkoutPlanState` (TypedDict holding user goals, recovery status, draft exercises, safety flags, and approval status).
2. Author graph nodes: `assess_volume`, `generate_split`, `validate_safety`, and `human_review_gate`.
3. Configure conditional routing: if `validate_safety` detects an injury conflict, route back to `generate_split` with feedback; otherwise route to `human_review_gate`.
4. Implement PostgreSQL checkpointer for state persistence across user approval pauses.
5. Add Node API gateway endpoint and wire mobile `WorkoutGeneratorScreen` to display pending plan for approval.

### 4.8 Testing Requirements
- Unit tests: test each node independently with deterministic inputs and mock LLMs.
- Trajectory tests: test the conditional cycle (injury detected → replan → approved).
- State checkpoint test: verify graph pauses at review gate and resumes successfully upon approval webhook.

### 4.9 Acceptance Criteria
- Plan generation completes multi-step reasoning across all 4 nodes.
- If a user has an active shoulder injury memory, bench press is automatically rejected and substituted with neutral-grip dumbbell press.
- Database write occurs ONLY after explicit user confirmation (Human-in-the-Loop).

### 4.10 Estimated Effort
3 weeks (30 engineering hours).

### 4.11 Resume and Interview Relevance
Demonstrates advanced Agent Orchestration: LangGraph state machines, cyclic graphs with conditional edges, human-in-the-loop checkpoints, and stateful agent persistence.

---

## Phase 5: Model Context Protocol (MCP) Integration

### 5.1 Objective
Standardize OnusFit's tool ecosystem by implementing a Model Context Protocol (MCP) server. Decouple domain APIs from the AI engine, enabling plug-and-play fitness tools across internal agents and external MCP-compliant clients.

### 5.2 Features to Implement
- **FitOnus MCP Server:** Standalone MCP server (TypeScript or Python) exposing resources, tools, and prompts:
  - Tools: `query_nutrition_diary`, `log_workout_session`, `get_recovery_biometrics`.
  - Resources: `user://profile`, `catalog://exercises`.
  - Prompts: `workout_audit_prompt`, `macro_adjustment_prompt`.
- **MCP Client Integration:** Connect Python AI backend as an MCP client using standard SSE/stdio transport.
- **Authorization & Tool Permissions:** Enforce user-scoped access control on every MCP tool invocation.

### 5.3 Existing Files to Reuse
- `backend/src/modules/workouts/`
- `backend/src/modules/nutrition/`
- `backend/src/modules/profile/`

### 5.4 New Files or Modules Required
- `backend/src/mcp/server.ts` (or `mcp-server/` package)
- `backend/src/mcp/tools/*.ts` (Standardized MCP tool definitions)
- `ai-backend/src/onusfit_ai/shared/mcp/client.py` (FastAPI MCP client manager)

### 5.5 Recommended Technologies
- Official Model Context Protocol SDK (`@modelcontextprotocol/sdk` for TS, `mcp` for Python)
- Transport: SSE (Server-Sent Events) over HTTP for networked microservices

### 5.6 Dependencies
Phase 3 (Tools).

### 5.7 Implementation Order
1. Initialize MCP server module in Node.js backend.
2. Register OnusFit tools with typed input schemas conforming to MCP standard.
3. Add authentication middleware verifying service JWT on MCP tool requests.
4. Integrate MCP Client into `ai-backend`, allowing agents to dynamically discover and invoke available tools.

### 5.8 Testing Requirements
- Protocol compliance test: verify MCP JSON-RPC 2.0 handshake and capability negotiation.
- Security test: verify tool execution fails if user lacks permission for requested resource.

### 5.9 Acceptance Criteria
- External MCP inspector successfully connects, lists tools, and executes queries.
- Python Coach Agent executes tools strictly through the MCP abstraction.

### 5.10 Estimated Effort
2 weeks (15–20 engineering hours).

### 5.11 Resume and Interview Relevance
Directly showcases mastery of cutting-edge Agent standards: Model Context Protocol (MCP), open tool protocols, and decoupled agent-service architectures.

---

## Phase 6: Automated AI Evaluation Pipeline & Golden Datasets in CI/CD

### 6.1 Objective
Implement a rigorous, production-grade AI Evaluation pipeline. Quantify accuracy, safety, groundedness, and hallucination reduction using Golden Datasets and LLM-as-a-Judge, running automatically in GitHub Actions as a merge gate.

### 6.2 Features to Implement
- **Curated Golden Benchmark Dataset:** 50+ diverse test cases covering:
  - Nutrition recognition (photographs with verified macronutrient ground truth).
  - Dialect speech transcription (Tamil/Tanglish ground truth audio).
  - Biomechanical injury queries (expected evidence-based citations).
  - Adversarial red-team prompts (eating disorder queries, steroid requests, medical diagnostic traps).
- **Automated Metric Suite:**
  - RAG Retrieval: Context Precision, Context Recall.
  - Generation: Faithfulness (hallucination rate), Answer Relevance.
  - Safety: Medical Disclaimer Adherence, Toxicity Score.
- **CI/CD Quality Gate:** GitHub Actions workflow executing eval suite on PRs touching prompts or AI code, blocking merges on regression.

### 6.3 Existing Files to Reuse
- `.github/workflows/ai-backend.yml`
- `ai-backend/tests/fixtures/`

### 6.4 New Files or Modules Required
- `ai-backend/tests/evals/golden_dataset.json` (Curated test benchmark cases)
- `ai-backend/tests/evals/eval_runner.py` (CLI evaluation runner)
- `ai-backend/tests/evals/metrics/*.py` (Custom evaluation metrics and judges)
- `.github/workflows/ai-evals.yml` (Dedicated CI evaluation workflow)

### 6.5 Recommended Technologies
- Framework: DeepEval or Ragas
- Evaluator Model: Gemini 2.5 Pro as LLM-as-a-Judge
- Reporting: Markdown test summaries attached to GitHub Actions run artifacts

### 6.6 Dependencies
Phase 1 (Structured Outputs), Phase 2 (RAG), Phase 3 (Tools).

### 6.7 Implementation Order
1. Build `golden_dataset.json` with 50 high-quality synthetic and validated edge cases.
2. Author evaluation harness using DeepEval / Ragas test cases.
3. Implement LLM-as-a-judge rubric evaluating clinical safety and faithfulness to retrieved chunks.
4. Create GitHub Actions workflow triggered on changes to `ai-backend/**` or `prompts/**`.
5. Define failure thresholds: Faithfulness < 0.90 or Safety < 1.0 fails the PR build.

### 6.8 Testing Requirements
- Unit test: verify evaluation rubric scoring on known good and known bad model responses.
- Synthetic regression test: intentionally degrade a prompt to verify CI gate correctly blocks the PR.

### 6.9 Acceptance Criteria
- 100% automated eval run completing in < 5 minutes in CI.
- Automated PR comments displaying Faithfulness, Relevance, and Latency deltas.
- Zero adversarial jailbreaks or un-disclaimed medical queries bypass the safety judge.

### 6.10 Estimated Effort
2 weeks (20 engineering hours).

### 6.11 Resume and Interview Relevance
Provides concrete, quantifiable evidence of professional AI Engineering: LLM-as-a-judge, RAG evaluation metrics (Faithfulness, Context Recall), and CI/CD automated AI regression gating.

---

## Phase 7: End-to-End AI Observability & Semantic Guardrails

### 7.1 Objective
Establish complete production observability with OpenTelemetry and Langfuse for distributed tracing, latency profiling, and cost attribution. Implement pre-flight and post-flight semantic guardrails for medical safety and prompt injection mitigation.

### 7.2 Features to Implement
- **Distributed AI Tracing (Langfuse / OpenTelemetry):**
  - Trace execution waterfall: Mobile Request → Node Gateway → FastAPI Sidecar → RAG Retrieval → LLM Generation → Tool Execution.
  - Record exact input/output tokens, latency p50/p95, and dollar cost per feature.
- **Pre-Flight Input Guardrail:** Detect and intercept prompt injections, jailbreaks, and out-of-scope requests (e.g., coding help, political commentary) before calling Gemini.
- **Post-Flight Output Guardrail:** Enforce mandatory medical disclaimers whenever injury, pain, or cardiovascular symptoms are mentioned, clamping any unsafe guidance.

### 7.3 Existing Files to Reuse
- `ai-backend/src/onusfit_ai/shared/observability/observability.py`
- `ai-backend/src/onusfit_ai/shared/logging/logging.py`
- `backend/src/shared/ai/ai-observability.ts`
- `backend/migrations/0015_create_gemini_management.sql`

### 7.4 New Files or Modules Required
- `ai-backend/src/onusfit_ai/shared/observability/langfuse_client.py`
- `ai-backend/src/onusfit_ai/shared/guardrails/input_guardrail.py`
- `ai-backend/src/onusfit_ai/shared/guardrails/output_guardrail.py`

### 7.5 Recommended Technologies
- Observability: Langfuse (self-hostable or cloud tier) or OpenTelemetry Collector + Jaeger
- Guardrails: NeMo Guardrails or lightweight regex/classifier guardrails with Llama Guard

### 7.6 Dependencies
Phase 1 through Phase 4.

### 7.7 Implementation Order
1. Instrument `GeminiClient` in Python with Langfuse decorators / OpenTelemetry spans.
2. Propagate trace context (`traceparent`, `X-Correlation-Id`) from Node HTTP calls into Langfuse traces.
3. Build input guardrail filter checking incoming prompts against injection signatures and non-fitness intents.
4. Build output guardrail validator enforcing clinical disclaimers.
5. Record failed and blocked requests in `gemini_usage_events` for complete admin visibility.

### 7.8 Testing Requirements
- Injection red-team test: test 30 known prompt injections (e.g., DAN, developer mode, base64 obfuscation).
- Medical disclaimer test: verify queries mentioning "chest pain" or "torn meniscus" consistently receive safety disclaimers.
- Tracing test: verify full trace span is visible in Langfuse with matching correlation ID.

### 7.9 Acceptance Criteria
- 100% of AI requests produce linked traces with latency, token counts, and cost breakdown.
- Input guardrail intercepts 100% of benchmark injection attempts in < 15ms without invoking Gemini.
- Zero medical emergency queries answer without prominent clinical disclaimers.

### 7.10 Estimated Effort
2 weeks (20 engineering hours).

### 7.11 Resume and Interview Relevance
Demonstrates production operational maturity: OpenTelemetry/Langfuse tracing, AI cost and latency monitoring, and multi-layer safety guardrails.

---

## Phase 8: Async Worker Infrastructure & AgentOps Production Hardening

### 8.1 Objective
Decouple heavy AI computations from HTTP request threads using Redis and an asynchronous background task queue, synchronize Docker Compose environments, implement distributed rate limiting, and finalize production deployment readiness.

### 8.2 Features to Implement
- **Async Task Queue:** Move long-running generation tasks (LangGraph weekly planning, bulk RAG indexing, memory consolidation) to background workers.
- **Docker Compose Synchronization:** Update `backend/compose.yaml` to orchestrate Postgres, Redis, Node Backend, and Python AI Backend seamlessly.
- **Distributed Rate Limiting:** Replace in-memory rate limiting with Redis-backed token bucket or sliding window limiter.
- **Automated Memory Consolidation Cron:** Periodic job consolidating redundant user memories and pruning expired context.

### 8.3 Existing Files to Reuse
- `backend/compose.yaml`
- `backend/src/shared/ai/ai-rate-limit.ts`
- `ai-backend/Dockerfile`
- `backend/Dockerfile`

### 8.4 New Files or Modules Required
- `backend/src/shared/queue/queue.ts` (BullMQ connection and job producer)
- `ai-backend/src/onusfit_ai/workers/task_worker.py` (Celery or ARQ background task consumer)
- `compose.prod.yaml` (Production-ready multi-service compose definition)

### 8.5 Recommended Technologies
- Redis 7 Alpine
- Queue: BullMQ (Node) or Celery / ARQ (Python)
- Load Testing: k6 or Locust

### 8.6 Dependencies
Phases 1 through 7.

### 8.7 Implementation Order
1. Add Redis service to `backend/compose.yaml` and configure connection parameters.
2. Add `ai-backend` container build to `compose.yaml` so `docker compose up` starts the entire system.
3. Replace `InMemoryAiRateLimitStore` with Redis-backed limiter in `backend/src/shared/ai/ai-rate-limit.ts`.
4. Implement background worker for async tasks with progress webhooks.
5. Run k6 load test simulating 50 concurrent mobile users chatting and parsing meals.

### 8.8 Testing Requirements
- Load test: 50 concurrent virtual users generating meals and chatting for 10 minutes.
- Worker resiliency test: kill worker during execution, verify task retry and dead-letter queue handling.
- Compose smoke test: spin up fresh machine with `docker compose up` and run full E2E verification script.

### 8.9 Acceptance Criteria
- API Gateway response time for enqueued tasks drops to < 50ms (returns task ID immediately).
- `docker compose up` boots the entire stack (Postgres + Redis + Node + Python) without manual intervention.
- Zero connection pool starvation or timeouts under 50 concurrent active users.

### 8.10 Estimated Effort
2 to 3 weeks (25 engineering hours).

### 8.11 Resume and Interview Relevance
Demonstrates senior distributed systems engineering: asynchronous job queues (BullMQ/Celery), Redis distributed caching/rate-limiting, container orchestration, and production load testing.

---

## Complete Effort & Timeline Summary

| Phase | Focus Area | Technologies | Estimated Effort | Portfolio Impact |
|---|---|---|---|---|
| **Phase 1** | Structured Outputs & SSE Streaming | Pydantic, JSON Schema, SSE | 1.5 – 2 Weeks | Eliminates parsing errors; real-time UX |
| **Phase 2** | RAG Foundation & pgvector | pgvector, text-embedding-004, FlashRank | 3 Weeks | Core RAG engineering; verified grounding |
| **Phase 3** | Tool Calling & Semantic Memory | Gemini Function Calling, Embeddings | 3 Weeks | ReAct agent loop; dynamic personalization |
| **Phase 4** | LangGraph Adaptive Planner | LangGraph, Postgres Checkpointer | 3 Weeks | Advanced multi-agent orchestration (HITL) |
| **Phase 5** | Model Context Protocol (MCP) | MCP SDK, SSE Transport | 2 Weeks | Cutting-edge agent tool standardization |
| **Phase 6** | AI Evaluation CI/CD Pipeline | DeepEval/Ragas, LLM-as-a-Judge | 2 Weeks | Quantifiable AI quality & safety metrics |
| **Phase 7** | Tracing & Guardrails | Langfuse/OTel, NeMo/Llama Guard | 2 Weeks | Production observability & clinical safety |
| **Phase 8** | Async Queues & AgentOps | Redis, BullMQ/Celery, Docker Compose | 2 – 3 Weeks | Production scalability & distributed systems |
| **Total** | **Full AI Engineering Transformation** | **Complete Full-Stack Agentic Stack** | **~18 – 20 Weeks** | **Top 1% Senior AI Engineer Profile** |

---

## Immediate Next Step

To begin implementation immediately, execute **Phase 1, Step 1**:
> **Task 1.1:** Upgrade `ai-backend/src/onusfit_ai/shared/llm/gemini.py` to pass Pydantic models directly to Gemini via `types.GenerateContentConfig(response_schema=..., response_mime_type="application/json")` and link them to `features/meals/` domain models, eliminating regex JSON string parsing.
