# OnusFit — AI Architecture Proposal

**Date:** 2026-11-18 · **Status:** Proposal only. The only part that exists is a health-endpoint foundation in `ai-backend/` (see [docs/architecture/PROJECT_STRUCTURE.md](Resources/docs/architecture/PROJECT_STRUCTURE.md)); no AI feature is implemented in Python.
**Naming decision (2026-11-18):** the Python application lives in **`ai-backend/`** with package **`onusfit_ai`**. Earlier drafts of this document and the roadmap called it `ai-service/`; "AI service" in the prose below means that application. The `graphs/` folder is named **`workflows/`**.
**Inputs:** `AI_ENGINEERING_BASELINE.md` (what exists) · `AI_ENGINEERING_ROADMAP.md` (how to get there)

---

## 1. Decision summary

**Recommendation: yes, add a dedicated Python FastAPI AI service. Keep it a *sidecar* to the existing Node.js backend, not a replacement, and grow it by strangler pattern, one vertical slice at a time.**

Be clear-eyed about why. The production app does **not** need Python today: the Node gateway is already good, and TypeScript has LangGraph.js, a pgvector client and a Langfuse SDK. The reasons to add it are:

1. **Your stated goal is an AI-engineering portfolio.** Most AI-engineer job descriptions, tutorials, eval tooling and framework docs are Python-first. Shipping a typed, tested, deployed Python service is a direct, checkable credential.
2. **Isolation of risk.** Experimental AI code (agents, retrieval, new prompts) can fail, be rolled back or be shut off without touching auth, workouts or nutrition logging, which is what Play Store users depend on.
3. **Forced clean contracts.** A network boundary forces an explicit, versioned API between "app" and "AI", which is itself a good architecture story.

Costs you are accepting (do not skip this list):
- A second language, build, CI job, container and deploy target to maintain alone.
- An extra network hop (typically tens of ms inside one region, but real) and a new failure mode (service down → fallbacks needed).
- Duplicate concerns (config, logging, auth between services).
- Risk of **doing it for the résumé instead of the user**. Mitigation: every slice must have a feature flag, a Node-side fallback and an eval proving it is not worse.

**What I would not do:** rewrite the working Node AI path, move auth/quota/billing into Python, or migrate everything at once.

---

## 2. Current vs. target architecture

### 2.1 Current

```
Mobile ─┐
        ├─►  Node API (Express 5, modular monolith) ──► Gemini
Admin  ─┘     • auth, domain modules, Postgres access
              • AiUsageGate (flags, quota, burst limit)
              • prompts + parsing in-process
              • telemetry → gemini_usage_events
                         │
                         ▼
                   PostgreSQL (Neon)
```

### 2.2 Target (end state of the roadmap)

```
Mobile ─┐                                     ┌───────────────────────────────┐
        ├─► Node API (system of record) ─────►│  FastAPI AI service (Python)  │──► Gemini
Admin  ─┘     • auth, users, domain data      │  • /v1/coach/chat  (SSE)      │
              • AiUsageGate (stays here)      │  • /v1/meals/ground           │
              • feature flags / kill switch   │  • /v1/plans/weekly (graph)   │
              • internal "tool" endpoints ◄───│  • RAG, memory extraction     │
              • JOB table (memory extraction) │  • Pydantic contracts         │
                   │                          │  • LangGraph workflows        │
                   │                          └───────┬──────────────┬────────┘
                   │                                   │              │
                   ▼                                   ▼              ▼
          PostgreSQL (Neon)  ◄──────────────  schema `ai` (pgvector)   Langfuse
           public.* domain tables              knowledge_chunks,       (traces, prompts,
           public.coach_* , gemini_*           memory_embeddings        eval datasets)
                                                                          
          Optional, only when 2+ API instances exist:  Redis (rate limits, breaker, cache)
          Optional, late: MCP server exposing read-only OnusFit tools
```

### 2.3 Responsibility split

| Concern | Stays in Node | Moves/added in Python |
|---|---|---|
| Authentication, user identity | ✅ | ❌ (receives a signed service token carrying `userId`) |
| Quota, burst limit, kill switches, billing record of truth | ✅ (`AiUsageGate`) | ❌ (reports token usage back) |
| Domain data and tool authorisation | ✅ internal endpoints | calls them |
| Prompt assembly, model calls for **new** features | legacy features remain until migrated | ✅ |
| Structured-output validation | Zod at API edge | ✅ Pydantic for model I/O |
| Embeddings, retrieval, rerank | ❌ | ✅ |
| Agent / graph orchestration | ❌ | ✅ |
| Tracing, eval datasets | emits trace id | ✅ Langfuse SDK |

**Why quota stays in Node:** it is atomic in Postgres, already refund-correct and already tested. Re-implementing it in a second language would create two sources of truth for money-adjacent logic.

### 2.4 Contract between the services

- **Transport:** HTTPS/JSON; SSE for streaming. Internal only (private network / not publicly routable if the host supports it; otherwise network allow-list plus auth).
- **AuthN:** short-lived service JWT (≤60 s) signed by Node, containing `sub=userId`, `aud=ai-backend`, `jti`, `scope`. Node already uses `jose` (see `backend/package.json`), so no new crypto dependency on that side. The AI service never accepts a `userId` from a request body.
- **Authorisation of tools:** Python calls Node *internal* endpoints (`/internal/tools/*`) with the same token; Node enforces ownership. This keeps one authorisation implementation. (Alternative, direct read-only SQL from Python, is faster but duplicates access rules; reconsider only if tool latency measurably hurts. Decision recorded in §7.)
- **Schema:** the AI service publishes an OpenAPI document from its Pydantic models; Node's client types are generated from it; a contract test in CI fails on drift.
- **Failure handling:** Node wraps every call with timeout, a circuit breaker (reuse the existing `ModelCooldownTracker` pattern) and the **existing in-process Gemini path as fallback**, so "AI service down" degrades to today's behaviour, not an error.
- **Idempotency & tracing:** Node passes `x-request-id` (the same id as the HTTP request) and an idempotency key; the AI service echoes `trace_id`.
- **Usage reporting:** the AI service returns `usage` (model, tokens incl. thinking, cost, prompt_version) in each response; Node writes it to `gemini_usage_events` (extended columns), keeping one cost ledger.

---

## 3. Technology evaluation

Each item: **Verdict · Concrete benefit · Concrete risk · When.** "Verdict" is one of ADOPT, ADOPT-LATER, LIMITED, SKIP.

### 3.1 Pydantic — **ADOPT** (Phase 2)
- **Benefit:** typed, validated models for (a) the Node↔Python contract, (b) LLM structured output (`model_validate_json` on schema-constrained Gemini output), (c) tool arguments. It is the Python equivalent of what Zod already does for you in Node, so it is a low-friction first step and the highest-value habit to demonstrate.
- **Risk:** negligible. Pin v2 semantics.
- **Acceptance signal:** zero un-validated model output reaches a response.

### 3.2 Gemini — **ADOPT (keep as sole provider)** (Phase 2)
- **Benefit:** already integrated, already cost-modelled, strong multimodal and multilingual (Tamil) support, an embeddings API, native function calling and `responseSchema`. Use the Python `google-genai` SDK. Learning to use these features *properly* (constrained decoding, function calling, thinking budget, context caching) is worth more than adding providers.
- **Risk:** provider concentration. Mitigation: a small `LlmProvider` protocol so one second adapter can be written as a **single exercise** (Phase 7), not a permanent commitment.
- **Not now:** multi-provider routing.

### 3.3 LangChain — **LIMITED**
- **Benefit (narrow):** document loaders and text splitters save time in the RAG ingestion pipeline, and the name appears in many job descriptions, so you should be able to discuss it from experience.
- **Risk:** thick abstractions over a thin SDK call, frequent API churn, harder debugging, and it obscures exactly the mechanics (prompts, parsing, retries) you want to be able to explain.
- **Plan:** build the first RAG pipeline with the raw SDK + a few lines of your own chunker; then, as a **bounded comparison exercise**, re-implement the retriever with LangChain components and write down what it bought you. Do not make it the backbone.

### 3.4 LangGraph — **ADOPT (one workflow)** (Phase 5)
- **Benefit:** a state-graph runtime with checkpointing, interrupts (human approval) and retries; this is exactly the shape of the weekly-plan workflow (draft → validate → repair → await approval → persist) and the unimplemented `workout_generator` slot. It is the most interview-relevant "agent" framework today.
- **Risk:** over-use. A graph for a single prompt is ceremony.
- **Rule:** use it for exactly **one** multi-step, stateful, human-in-the-loop flow. Chat stays a plain tool-calling loop.

### 3.5 RAG — **ADOPT** (Phase 3)
- **Benefit (product):** cited, grounded answers for training and nutrition claims; grounding meal parsing in a food-composition table instead of the model's guess. **Benefit (career):** retrieval metrics and hybrid search are core interview content.
- **Risk:** content licensing and medical liability. Use only sources you may redistribute (for example USDA FoodData Central is public domain; verify the licence of any Indian food-composition table or guideline before ingesting). Include provenance on every chunk. Keep "not medical advice" and the red-flag escalation path in front of it.
- **Anti-goal:** a giant corpus. 100-300 well-chosen chunks with a labelled question set beat 10,000 unmeasured ones.

### 3.6 pgvector — **ADOPT** (Phase 3)
- **Benefit:** no new datastore: Neon Postgres already exists and supports the extension (verify on your plan). Joins and per-user filters are plain SQL; hybrid search combines `tsvector` + vector in one query; transactional with the rest of your data. Teaches HNSW vs IVFFlat, distance operators and filtered ANN.
- **Risk:** at your scale none. Beyond ~millions of vectors a dedicated store might matter; irrelevant here.
- **Not recommended:** adding Pinecone/Weaviate/Qdrant "to learn them". It would add a service without answering a question pgvector can't.

### 3.7 Redis — **ADOPT-LATER (conditional)** (Phase 7)
- **Benefit (real):** the code already isolates the seam (`AiRateLimitStore`, and the breaker and cache are simple maps) and documents the multi-instance inaccuracy. Redis fixes burst limiting, breaker state and shared caches across instances.
- **Risk:** another stateful service to run and pay for, purely to fix a problem you may not have: with one API instance today, the in-memory implementations are *correct*. The daily quota, the hard spend control, is already in Postgres.
- **Trigger:** adopt only when you actually run ≥2 API instances, **or** as a deliberate learning exercise with a feature flag. For job queues start with a Postgres job table (`FOR UPDATE SKIP LOCKED`), which is enough for memory extraction and plan generation.
- **Also valid:** semantic response caching, but only after evals show it does not degrade answers.

### 3.8 MCP (Model Context Protocol) — **ADOPT-LATER, small** (Phase 7)
- **Benefit:** expose a **read-only** OnusFit tool server (`get_workout_history`, `get_nutrition_summary`) so any MCP client (an IDE assistant, Claude Desktop) can query a *test account's* data. It demonstrates the standard tool-protocol story and reuses the same internal tool endpoints and schemas written for the agent.
- **Risk:** MCP adds an authentication and multi-tenant exposure surface; a naive server can leak other users' data. For the mobile app itself MCP gives no benefit, because your own tool loop already works.
- **Scope guardrails:** read-only, one demo user, local transport or authenticated, never wired to production data without per-user OAuth.

### 3.9 Langfuse — **ADOPT** (Phase 1, early)
- **Benefit:** traces for every LLM call (prompt version, tokens, latency, tool spans), prompt management, datasets and eval runs, plus user-feedback scores (your existing like/dislike). It is the missing observability and eval layer and makes the "debug a bad answer" interview story concrete. Self-hostable.
- **Risk (privacy):** traces would contain health data. Options: self-host via Docker (recommended), or cloud with a scrubber that strips names/free-text and a short retention window. Never send raw memories or photos to a third-party trace store without a decision on user consent.
- **Not instead of** your DB cost ledger. Langfuse is for debugging and evals; `gemini_usage_events` stays the billing record.

### 3.10 Docker — **ADOPT (already in use)** (Phase 2)
- **Benefit:** you already have a multi-stage Node image and a compose file. Add a Python image (slim, non-root, healthcheck), switch the dev DB image to a pgvector-enabled Postgres, and add Langfuse to compose so `docker compose --profile ai up` runs the whole stack locally.
- **Risk:** none material.

### 3.11 CI/CD — **ADOPT (extend existing)** (Phase 1–2, 7)
- **Benefit:** `.github/workflows/ci.yml` already has typecheck/lint/test/integration/migrations/gitleaks/docker-build for Node. Add: Python lint+type check (`ruff`, `mypy` or `pyright`), `pytest`, contract test against the OpenAPI doc, **offline eval gate on recorded outputs**, and a nightly live eval with a hard spend cap. Add CD only after the above is stable (image push, then deploy to a staging service, then production).
- **Risk:** flaky, costly live-model tests in PR CI. Mitigation: PR CI uses recorded fixtures only.

### 3.12 Summary table

| Technology | Verdict | Phase | The one-line reason |
|---|---|---|---|
| Pydantic | ADOPT | 2 | Typed contracts + validated LLM output |
| Gemini (google-genai) | ADOPT, sole provider | 2 | Already integrated; use its constrained decoding, tools, embeddings |
| LangChain | LIMITED | 3 | Splitters/loaders; bounded comparison exercise only |
| LangGraph | ADOPT, one workflow | 5 | Stateful, human-in-the-loop plan generation |
| RAG | ADOPT | 3 | Cited grounding + measured retrieval |
| pgvector | ADOPT | 3 | Vectors inside the Postgres you already run |
| Redis | ADOPT-LATER | 7 | Only when ≥2 instances; seam already exists |
| MCP | ADOPT-LATER, small | 7 | Read-only tool server demo, reuses agent tools |
| Langfuse | ADOPT | 1 | Tracing, prompt versions, eval datasets |
| Docker | ADOPT | 2 | Extend existing images and compose |
| CI/CD | ADOPT | 1–7 | Eval gate and Python jobs on existing pipeline |

---

## 4. Service design (FastAPI)

### 4.1 Layout
```
ai-backend/                      # created: foundation only; folders below are added with their first real file
├── pyproject.toml               # uv or pip-tools; pinned deps
├── Dockerfile
├── src/onusfit_ai/
│   ├── main.py                  # FastAPI app, lifespan, middleware
│   ├── api/                     # routers: coach, meals, plans, health
│   ├── contracts/               # Pydantic models shared with Node via OpenAPI
│   ├── core/                    # settings, auth (service JWT), logging, tracing
│   ├── llm/                     # LlmProvider protocol, Gemini adapter, structured-output helper
│   ├── prompts/                 # versioned prompt files + registry
│   ├── retrieval/               # chunking, embedding, hybrid search, rerank
│   ├── tools/                   # tool definitions → Node internal endpoints
│   ├── workflows/               # LangGraph workflows (the agent graphs)
│   └── memory/                  # extraction, dedup, retrieval
├── tests/                       # unit (fake LLM), contract, retrieval
└── evals/                       # datasets, judges, runners (shared by CI)
```

### 4.2 Endpoints (initial)
| Endpoint | Phase | Notes |
|---|---|---|
| `GET /health/live`, `/health/ready` | 2 | Readiness checks DB + provider key presence |
| `POST /v1/meals/parse-text` | 2 | First slice; shadow-mode vs Node |
| `POST /v1/coach/chat` (SSE) | 4 | Tool-calling loop + RAG + memory retrieval |
| `POST /v1/memory/extract` | 4 | Called by Node job worker |
| `POST /v1/plans/weekly` (+ resume) | 5 | LangGraph; checkpointed |
| `POST /v1/ingest` (admin-only) | 3 | Knowledge base ingestion |

### 4.3 Data
- New migration (Node-owned migration runner stays the single source of schema truth): `CREATE EXTENSION vector`; schema `ai`; tables `ai.knowledge_chunks(id, source, license, title, content, tsv, embedding vector(N), embed_model, created_at)` and `ai.memory_embeddings(memory_id FK coach_memories, user_id, embedding, embed_model)`; HNSW indexes. `N` and the embedding model id must be chosen from the current Gemini embeddings docs at implementation time (store `embed_model` so you can re-embed later).
- Python connects with a **dedicated DB role**: read/write on schema `ai`, no direct access to `public` user tables (tools go through Node). Principle of least privilege.

### 4.4 Non-functional targets (initial, to be validated by measurement)
| Metric | Target |
|---|---|
| Added hop latency (Node → AI service, same region) | p95 < 50 ms overhead |
| Chat time-to-first-token (streaming) | p95 < 2 s |
| Schema-valid structured outputs | ≥ 99.5% (after one repair) |
| Retrieval recall@5 on labelled set | ≥ 0.85 (set the baseline first, then improve) |
| Fallback correctness when AI service is down | 100% of features degrade to today's behaviour |

---

## 5. Migration strategy (strangler)

1. **Shadow mode:** Node still answers from its in-process path. It also sends the same input to the AI service, discards the result, and logs a comparison (latency, validity, agreement). Zero user impact.
2. **Canary:** feature flag per user cohort (admin settings already has feature flags) → small % served by Python.
3. **Cutover** per feature once the eval gate shows v2 ≥ v1 on quality, safety and cost.
4. **Keep the legacy path for one release** as the automatic fallback, then delete it.

Rollback at every step = flip a flag; no data migration is needed in the early slices.

---

## 6. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Over-engineering; project stalls | **High** | Phase gates with acceptance criteria; ship one slice at a time; every phase must be demoable alone |
| Breaking the working Play Store app | Low if followed | Additive only; flags; legacy fallback; no changes to mobile until a slice is proven |
| Health-data privacy (third-party traces, embeddings, provider) | Medium | Self-host Langfuse, scrub PII, data-minimise prompts, document retention, honour `ai_memory_enabled` and `sensitive` |
| Medical-advice liability | Medium | Red-flag classifier, citations only from vetted sources, disclaimers, no dosage/diagnosis |
| Cost blow-up (evals, embeddings, agents) | Medium | Spend cap at provider, per-run step/token budgets, offline fixtures in PR CI |
| Operational load of a solo dev running 2 services | Medium | Single compose file, shared CI, same logging/request-id conventions, simple deploys |
| Free-tier cold starts on the host making the extra hop slow | Medium (unverified) | Measure first; keep AI service warm or accept async features first |
| Prompt-injection through memory/RAG content | Medium → High with tools | Instruction/data separation, tool-arg authorisation, no write tools without user confirmation, red-team CI |

---

## 7. Decision log (to be filled during implementation)

| # | Decision | Current choice | Revisit when |
|---|---|---|---|
| D1 | Tool data access: Node internal API vs direct read-only SQL | Node internal API (single authz) | Tool latency p95 > 300 ms |
| D2 | Streaming protocol | SSE | Need bidirectional (barge-in voice) |
| D3 | Job queue | Postgres table, `SKIP LOCKED` | Throughput or scheduling needs exceed it, or Redis already present |
| D4 | Trace store | Self-hosted Langfuse | Cloud acceptable after scrubber + consent decision |
| D5 | Embedding model | Chosen from current Gemini docs at Phase 3 | Quality or cost change |
| D6 | Redis | Not adopted | ≥2 API instances |
| D7 | MCP | Not adopted | Phase 7 |
| D8 | Python tooling | `uv` + `ruff` + `mypy`/`pyright` + `pytest` | Team conventions |

---

## 8. What would make me change this recommendation

- If your goal were *only* to ship the best possible app with the least maintenance, I would stay TypeScript-only: adopt structured output, tools, pgvector and Langfuse inside Node. Roughly 70% of the baseline gaps can be closed in the existing codebase.
- If you cannot commit to maintaining two services, do **Phases 0–1 in Node** (they are the highest-value and language-agnostic), then build the Python service as a separate, clearly labelled portfolio component that the app only calls for non-critical features.
