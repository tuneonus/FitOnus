# Phase 13: Multi-Agent Fitness Intelligence Systems

## 1. Overview & Architecture
Phase 13 introduces a coordinated, cost-bounded multi-agent system inside `ai-backend/` (`onusfit_ai`) integrated behind a disabled-by-default feature flag (`AI_COACH_MULTI_AGENT_ENABLED`). It preserves Clean/Hexagonal Architecture:

- **Domain Contracts & Ports:** `ai-backend/src/onusfit_ai/features/coach/domain/multi_agent.py` defines framework-free contracts (`AgentRole`, `AgentCapability`, `OrchestrationMode`, `DelegatedTask`, `RoutingDecision`, `SharedExecutionContext`, `MinimalAgentContextView`, `AgentExecutionResultItem`, `MultiAgentExecutionBudget`, `MultiAgentFinalResult`) and structural protocols (`A2AMediatorProtocol`, `WorkoutPlannerPort`, `McpToolGatewayPort`).
- **Composition-Root Wiring:** Cross-feature dependencies (`features.mcp.application.a2a.A2AMediator` and Phase 11 `features.workout_planner.WorkoutPlanGenerator`) are wired in `ai-backend/src/onusfit_ai/main.py` via `shared/tools/multi_agent.py` (`set_multi_agent_providers`) and `_WorkoutPlannerPortAdapter`, avoiding any cross-feature imports in `features/coach/`.
- **System Ownership:** Node.js (`backend/`) continues to own JWT auth, PostgreSQL persistence, user quotas, and internal data APIs; Python (`ai-backend/`) owns multi-agent orchestration. PostgreSQL remains the single source of truth; no Redis/message brokers or microservices were added, and Phase 14 streaming was not implemented.

## 2. Agent Responsibilities
No standalone domain services were duplicated:

| Agent | Role & Capabilities | Reused FitOnus Capabilities |
| :--- | :--- | :--- |
| **Supervisor Agent** | Intent classification, DAG routing, conflict resolution, single-call multilingual synthesis | Coach system prompts (`prompts/coach_chat.py`), `GeminiCoachReplyOutput`, `SupervisorRouter` |
| **Workout Agent** | Routine planning, training adaptation, history review, exercise substitution | Phase 11 `WorkoutPlannerPort` (`WorkoutPlanGenerator` / `WorkoutSafetyValidator`), `get_recent_workouts`, `preview_workout_plan`, `search_exercises` |
| **Nutrition Agent** | Weekly nutrition consistency analysis, calorie/protein guidance, <1200 kcal floor safety check | `get_nutrition_summary`, `preview_nutrition_plan`, `validate_nutrition_safety_bounds` |
| **Progress Agent** | Training adherence, volume summaries, 30-day weight trend analysis | `get_recent_workouts`, `get_nutrition_summary`, `get_weight_trend` |
| **Recovery Agent** | User-reported fatigue/soreness assessment & deload recommendations (never fabricates wearable/HRV/sleep sensors) | User-reported symptoms, `get_recent_workouts`, clinical red-flag checks |
| **Knowledge Agent** | Sports-science RAG evidence retrieval and citation provenance | Pre-assembled `request.knowledge`, `retrieve_fitness_knowledge`, `get_exercise_details` |

## 3. Supervisor & Deterministic Routing
`SupervisorRouter` (`features/coach/application/multi_agent/router.py`) routes requests deterministically across English (`en`), Tamil (`ta`), and Tanglish (`tanglish`):

- **Simple-Query Bypass (`BYPASS`):** Greetings (`"Hi coach"`, `"வணக்கம்"`, `"Vanakkam"`) and simple local metric questions (`"How many calories did I log today?"`) skip specialist invocation and go straight to synthesis.
- **Execution Modes:** `SINGLE_AGENT`, `SEQUENTIAL` (e.g., `Progress -> Workout`, `Recovery -> Workout`), `PARALLEL` (e.g., `Workout + Nutrition` consistency), and `HYBRID` (e.g., balanced fitness routine combining progress-dependent workout planning with nutrition and recovery).
- **Cost & Availability Pruning:** Consults `A2AMediator.discover_agents(only_available=True)` and trims lower-priority tasks to `budget.max_agent_invocations`.

## 4. A2A & MCP Boundaries
- **Internal A2A (`features/mcp/application/a2a.py`):** Handles inter-agent task coordination (`REQUEST`, `INFORM`, `REFUSE`, `PARTIAL`, `CANCEL`, `FAILURE`), agent capability cards, circular delegation blocking (`recipient == sender` or in `delegation_chain`), delegation depth limits (`max_depth=1`), duplicate-task caching per conversation, cooperative cancellation, dependency-aware parallel/sequential DAG execution (`execute_task_dag`), failure propagation, and result aggregation.
  - *Scope Boundary:* This is an in-process FIPA-ACL-inspired mediator—no external HTTP/JSON-RPC A2A agent federation is claimed or implemented.
- **MCP Tool Gateway (`features/coach/application/multi_agent/mcp_gateway.py`):** Handles external read tool invocations via Phase 12 `McpClientAdapter`, kept strictly distinct from A2A control flow.

## 5. LangGraph Bounded Multi-Agent Workflow
Implemented under `features/coach/application/multi_agent/graph/`:

`START -> interpret_intent -> select_agents -> [BYPASS -> final_synthesis | DELEGATE -> delegate_tasks] -> execute_agents -> aggregate_results -> validate_results -> [replan_tasks -> delegate_tasks | final_synthesis] -> END`

- **Typed Reducers (`graph/state.py`):** Merge task results by `task_id`, deduplicate evidence/recommendations, and record executed task signatures.
- **Bounded Replanning:** `validate_results` triggers at most `max_replanning_attempts=1` recovery task (e.g., `KnowledgeAgent`) on non-medical/non-circular transient failures if invocation and deadline budgets permit. `recursion_limit` and `completed_task_ids` prevent infinite loops.

## 6. Shared Context, Memory & Conflict Resolution
`features/coach/application/multi_agent/context.py`:
- `SharedExecutionContext` is strictly request-scoped (isolated per `user_id` & `trace_id`, never shared or auto-persisted).
- `build_agent_context_view` passes only domain-relevant slices to each specialist.
- Memory injection requires explicit `memory_consent_granted` and removes static profile duplicates.
- `resolve_recommendation_conflicts` deterministically enforces priority order: **(1) Clinical medical red flags halt strenuous exercise > (2) Recovery deload overrides aggressive workout progression > (3) Standard specialist advice**.

## 7. Execution Budgets, Cost Optimization & Reliability
`CumulativeBudgetTracker` (`budgets.py`) enforces request-level shared limits (never multiplied per agent):
- Defaults: `max_agent_invocations=6`, `max_llm_calls=2`, `max_input_tokens=6000`, `max_output_tokens=2000`, `max_total_tokens=8000`, `max_tool_calls=6`, `max_delegation_depth=1`, `max_replanning_attempts=1`, `max_concurrent_agents=3`, `deadline_seconds=20.0`.
- Specialists are deterministic in-process analysts calling grounded services/tools, reserving LLM usage for the Supervisor synthesis call using `request.model.primary`/`fallback`.
- Request-scoped tool caching + `asyncio.Lock` in-flight coalescing avoids redundant calls across agents (e.g., `get_recent_workouts` shared between Progress and Workout).

## 8. Security, Authorization & Phase 12 Prerequisites
Phase 12 security hardening completed prior to Phase 13:
- `ApprovalManager`: lock-protected single-use tickets (`PENDING -> CONSUMED`), payload SHA-256 hash binding, non-empty `user_id` ownership checks, replay blocking.
- `IdempotencyManager`: `(user_id, tool_name, idempotency_key)` scoping, payload conflict detection, 3600s TTL.
- Routes & `McpClientAdapter`: JWT `claims.user_id` binding, direct `confirmed=True` bypass blocked when `strict_hitl_tickets=True`, `include_write_tools=False` default, confused-deputy `userId`/`targetUserId`/`user_id` argument rejection.
- **Persistent Mutations Disabled:** `persist_workout_plan` remains disabled (`MUTATION_TOOLS`) unless both `allow_mutations=True` and `durable_node_approval_verified=True` (Node.js currently exposes only read-only internal tools).

## 9. Fallback Behavior & Coach Integration
- Feature flag `AI_COACH_MULTI_AGENT_ENABLED` (or `COACH_MULTI_AGENT_ENABLED`) defaults to `false` and fails closed on invalid strings (`configuration_problems()` reports malformed flags).
- `MultiAgentMcpGateway` falls back to native `InternalToolsClient` on transient MCP failures (never on security/validation/approval denials or when deadline/cancel triggers).
- `MultiAgentCoachExecutor` falls back to Phase 10 `LangGraphAgentExecutor` / Phase 09 native `AgentExecutor` on unexpected workflow errors, forwarding cached tool signatures to avoid duplicate execution. If LLM synthesis hits budget/safety errors, `SupervisorAgent._deterministic_fallback_result` returns grounded output.
- Observability (`telemetry.py`) reuses `shared.logging.log_event` and `trace_id` (`multi_agent.routing.decided`, `multi_agent.agent.completed`, `multi_agent.workflow.completed`) without logging `user_id`, fitness records, prompts, credentials, or thoughts.

## 10. Verified Test & Evaluation Results
All checks ran offline with `FakeLlm` and mocked internal tools (no live Gemini calls, no live migrations/deployments):
- **Full `ai-backend` test suite (`pytest -q`):** **1091 passed** (0 failed).
- **Phase 11–13 targeted suite:** **425 passed** (contracts, A2A/MCP gateway, compiled LangGraph workflows, HTTP integration + privacy logging, architecture AST boundaries, observability, Phase 11 workout planner, Phase 12 MCP tests including 40 `mcp_tools` cases, and Phase 13 evals).
- **Offline Evaluation (`tests/evals/test_runner.py`):** **277/277** cases passing across all datasets, including **42 multi-agent cases** (`MA_001`..`MA_042`) and compiled LangGraph execution over representative scenarios.
- **Static Checks on Phase 12–13 Scope:** `ruff check` and `mypy` strict (`72 source files`) passed with zero errors.
- **Node.js `backend`:** `tsc --noEmit` and 4 targeted unit test suites (**34 passed**, covering `internal-tools-auth`, `internal-tools-controller`, `ai-workout-planner`, `coach-chat-python-integration`).

## 11. Known Limitations & Phase 14 Readiness
- Mutating workout/meal persistence tools remain disabled pending durable Node.js approval tickets + write endpoints in Node.js/PostgreSQL.
- `A2AMediator` is strictly single-process in-memory; cross-process agent messaging is intentionally excluded.
- Pre-existing untouched working-tree files (`ai-backend/src/onusfit_ai/shared/utils/{text,audio}.py`, `ai-backend/tests/test_media_rules.py`, and full-backend ESLint backlog) retain pre-existing lint/mypy findings outside Phase 13 scope.
- Phase 14 Streaming AI can wrap `MultiAgentCoachExecutor` event emissions cleanly once streaming transport contracts are approved.

