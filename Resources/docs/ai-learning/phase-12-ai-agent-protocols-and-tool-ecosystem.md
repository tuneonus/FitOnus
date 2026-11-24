# Phase 12: AI Agent Protocols & Tool Ecosystem — Architectural Guide

> **Component:** Model Context Protocol (MCP) & Autonomous AI Agent Subsystem  
> **Status:** IMPLEMENTED & PRODUCTION-VERIFIED  
> **Frameworks:** Python 3.12 (`FastAPI`, `mcp==2.3.0`, `Pydantic v2`), Node.js / Express 5 (`TypeScript`, `Zod v4`)  
> **Master Learning Guide:** [PHASE_12_LEARNING_GUIDE.md](../../../PHASE_12_LEARNING_GUIDE.md)

---

## 1. Architectural Overview & Philosophy

FitOnus Phase 12 implements an enterprise-grade **Model Context Protocol (MCP)** subsystem and comprehensive AI tool ecosystem. It exposes FitOnus business capabilities as secure, typed, discoverable tools, resources, and prompt templates, adhering to Anthropic's official MCP specification and Clean/Hexagonal Architecture boundaries.

### Core Architecture Highlights
1. **Official MCP SDK Integration**:
   - Implements `FitOnusMcpServer` and `FitOnusMcpClient` backed by official `mcp` SDK (`mcp.server.mcpserver.MCPServer`, `mcp.client.session.ClientSession`).
   - Supports both Streamable HTTP ASGI endpoints and local STDIO IPC transport.
2. **OnusFit Tool Ecosystem (10 Domain Tools)**:
   - `get_fitness_profile`, `get_recent_workouts`, `search_exercises`, `get_exercise_details`, `preview_workout_plan`, `validate_workout_plan`, `persist_workout_plan`, `get_nutrition_summary`, `preview_nutrition_plan`, `get_weight_trend`.
3. **Deterministic Human-in-the-Loop (HITL) Gating**:
   - Write operations (`persist_workout_plan`) cannot execute autonomously. They generate an ephemeral approval ticket requiring user confirmation via `/internal/v1/mcp/approval/confirm`.
4. **Idempotency Protection**:
   - Duplicate mutations prevented via UUID-based idempotency caching with 1-hour TTL.
5. **Anti-Confused Deputy Isolation**:
   - Tool argument schemas strictly forbid `user_id`. Caller identity is extracted exclusively from validated session headers and propagated via `contextvars.ContextVar`.
6. **Prompt Injection & Delimiter Sanitization**:
   - Input/output sanitization prevents delimiter breakouts (`</grounding_observations>`, `<system>`) and scrubs credential tokens.
7. **Agent-to-Agent (A2A) Coordination**:
   - Implements `A2AMediator` with FIPA-ACL performatives (`REQUEST`, `INFORM`, `AGREE`, `REFUSE`, `CONFIRM`, `FAILURE`) for specialized agent delegation.

---

## 2. Directory Layout & Module Structure

```
ai-backend/src/onusfit_ai/features/mcp/
├── domain/
│   ├── contracts.py           # Domain models & structural protocol interfaces
│   ├── errors.py              # Pure domain exceptions
│   └── __init__.py
├── application/
│   ├── registry.py            # McpToolRegistry (10 tools, 3 resources, 2 prompts)
│   ├── security.py            # McpSecurityGuardrails (anti-confused deputy, injection defense)
│   ├── orchestrator.py        # AgentToolOrchestrator, ApprovalManager, IdempotencyManager
│   ├── a2a.py                 # A2AMediator & performatives
│   └── __init__.py
└── presentation/
    ├── server/                # Official MCP Server builder & transports
    ├── client/                # Official MCP Client adapter
    ├── routes.py              # FastAPI endpoints (/internal/v1/mcp/*)
    ├── stdio_runner.py        # STDIO IPC CLI entrypoint
    └── __init__.py
```

---

## 3. Verification & Metrics

- **Unit Test Suite**: 43 unit tests passing in `ai-backend/tests/test_mcp_*.py`
- **Architecture Integrity**: 22 tests passing in `ai-backend/tests/test_architecture.py` (0 violations)
- **Offline Evaluation Benchmark**: 7 tests passing in `ai-backend/tests/evals/offline/test_mcp_eval.py` across 32 golden test cases in `mcp_tools_benchmark.json`
- **Node.js Typecheck & Tests**: 191 test files, 2917 passed in `backend`

For detailed deep-dive explanations, request lifecycles, debugging patterns, and interview questions, refer to the master [PHASE_12_LEARNING_GUIDE.md](../../../PHASE_12_LEARNING_GUIDE.md).
