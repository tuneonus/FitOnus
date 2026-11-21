# TOPIC 01: Python FastAPI Architecture — KT & Interview Master Guide

> **Module:** OnusFit AI Backend (`ai-backend/`)  
> **Source Target:** `ai-backend/src/onusfit_ai/main.py`  
> **Learning Status:** COMPLETED  
> **Category:** Core Microservice Architecture

---

## 1. Executive Summary & Architecture Overview

The OnusFit AI backend is an internal, asynchronous Python microservice built with **FastAPI**, **Starlette** (ASGI core), and **Pydantic** (data validation contracts). It executes heavy AI workloads (multimodal image nutrition analysis, speech transcription, and generative fitness coaching) on behalf of the primary Node.js backend.

### Key Architecture Decisions:
1. **Application Factory Pattern:** Instead of instantiating `app = FastAPI()` globally, `create_app()` dynamically wires error handlers, middlewares, and routers for isolated unit testing.
2. **Private Service Hardening:** Swagger UI (`docs_url=None`), ReDoc (`redoc_url=None`), and OpenAPI schema (`openapi_url=None`) are disabled to prevent exposing internal API contracts.
3. **Lifespan Management:** Uses modern Python `@asynccontextmanager` for startup checks and fail-fast validation.
4. **Clean Architecture Isolation:** `main.py` is the Composition Root. It contains zero domain business logic and zero Gemini SDK calls; it mounts only presentation-layer routers.

---

## 2. Code Reference & Implementation Details

### File: `ai-backend/src/onusfit_ai/main.py`

```python
def create_app() -> FastAPI:
    """Create and configure the FastAPI application instance."""
    app = FastAPI(
        title="OnusFit AI Backend",
        version=__version__,
        docs_url=None,      # Disables /docs (Swagger UI) for private service security
        redoc_url=None,     # Disables /redoc
        openapi_url=None,   # Disables openapi.json schema leakage
        lifespan=lifespan,  # Attaches asynccontextmanager for startup checks
    )
    register_error_handlers(app)  # Wire custom exception handlers to uniform JSON errors
    app.add_middleware(RequestObservabilityMiddleware)  # Wrap application with tracing

    # Mount modular feature routers
    app.include_router(health_router)   # /health
    app.include_router(coach_router)    # /internal/v1/ai/coach/*
    app.include_router(meals_router)    # /internal/v1/ai/meals/*
    app.include_router(speech_router)   # /internal/v1/ai/speech/*
    return app


app = create_app()  # ASGI module-level target for Uvicorn
```

---

## 3. Request Lifecycle & Flow

```text
Node.js Express Backend
       │  (Internal HTTP POST with Service JWT)
       ▼
┌─────────────────────────────────────────────────────────────┐
│ Uvicorn ASGI Server (0.0.0.0:10000)                         │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ RequestObservabilityMiddleware (main.py:90)                 │
│ - Reads and validates x-correlation-id & x-request-id       │
│ - Injects IDs into Python ContextVars                       │
│ - Starts high-precision timer (time.perf_counter())         │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ FastAPI Application Routing (main.py:93-96)                 │
│ ├── /health                          -> health_router       │
│ ├── /internal/v1/ai/coach/*          -> coach_router        │
│ ├── /internal/v1/ai/meals/*          -> meals_router        │
│ └── /internal/v1/ai/speech/*         -> speech_router       │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Feature Presentation Layer                                  │
│ - Depends(require_scope) -> Service JWT Auth Verification   │
│ - Pydantic Request Validation (extra='forbid')              │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Application Use Case -> Gemini LLM Invocation               │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Error Handling & Startup Fail-Fast Logic

### Fail-Fast Implementation:
```python
problems = configuration_problems()
fatal = settings is None or is_production(settings)
if problems and fatal:
    raise RuntimeError("Invalid configuration: " + "; ".join(problems))
```
- In production, missing critical keys (`GEMINI_API_KEY`, `AI_SERVICE_JWT_SECRET`) causes the service to crash immediately upon boot rather than serving degraded 503 errors.
- Raw secret strings are **never** logged; only Boolean indicators (`bool(settings.gemini_api_key)`) are emitted.

---

## 5. 15 Technical Interview Questions & Answers

### A. Beginner Level
1. **Q: Why is `create_app()` factory function used instead of global `app = FastAPI()`?**
   *A:* It enables instantiating independent isolated app instances for unit and integration testing without polluting global state.
2. **Q: What is Uvicorn's role in a FastAPI project?**
   *A:* Uvicorn is an ASGI web server that translates incoming TCP/HTTP socket streams into ASGI event specifications consumed by FastAPI.
3. **Q: Why are `docs_url` and `openapi_url` set to `None` in OnusFit?**
   *A:* To disable Swagger UI and OpenAPI JSON specs in a private microservice, preventing exposure of internal service contracts.
4. **Q: What is the purpose of `app.include_router()`?**
   *A:* It separates API endpoints into modular feature-specific route collections rather than dumping all routes into a single monolithic file.
5. **Q: How does `lifespan` work in modern FastAPI?**
   *A:* It uses `@asynccontextmanager` to execute startup routines before `yield` and shutdown cleanup routines after `yield`.

### B. Intermediate Level
6. **Q: How does `RequestObservabilityMiddleware` maintain request correlation across async tasks?**
   *A:* It reads `x-correlation-id` and sets it in Python `contextvars.ContextVar`. In asyncio, contextvars are preserved across coroutine calls without passing IDs as function arguments.
7. **Q: What is the "Fail-Fast" startup strategy implemented in `run_startup_checks()`?**
   *A:* If critical environment configurations are invalid or missing in production, the service immediately throws `RuntimeError` and refuses to boot, preventing broken deployments.
8. **Q: Why does OnusFit avoid logging `str(exc)` in unhandled errors?**
   *A:* Exception strings often echo raw payload content or database attributes containing Personally Identifiable Information (PII) or sensitive prompts. Logging only `type(exc).__name__` prevents data leakage.
9. **Q: How does FastAPI achieve automatic input validation?**
   *A:* Through Pydantic type annotations in route signatures. FastAPI deserializes incoming JSON and validates it against Pydantic schema before executing the route handler.
10. **Q: Why is `/health` excluded from HTTP request logging?**
    *A:* Cloud orchestrators poll `/health` every few seconds. Logging these polls would spam logs and bury genuine application traffic logs.

### C. Advanced Level
11. **Q: What is the architectural role of `main.py` in Clean Architecture?**
    *A:* `main.py` is the Composition Root. It has zero business logic and zero direct SDK dependencies; it only wires presentation adapters, middlewares, and exception handlers together.
12. **Q: How does pure ASGI middleware differ from BaseHTTPMiddleware in Starlette?**
    *A:* `BaseHTTPMiddleware` buffers and parses streaming responses, which introduces overhead and contextvar edge cases. Pure ASGI middleware (`__call__(scope, receive, send)`) directly intercepts raw ASGI protocol messages with zero buffering.
13. **Q: Why does OnusFit's AI backend avoid managing a database connection pool?**
    *A:* Keeping the AI service stateless simplifies horizontal scaling, eliminates cross-service database locks, and enforces that Node.js remains the sole source of truth for business data persistence.
14. **Q: How does FastAPI handle concurrent async I/O requests vs CPU-bound tasks?**
    *A:* Async routes (`async def`) execute cooperatively on the main asyncio event loop. For I/O tasks like Gemini API calls, the event loop yields to other concurrent requests while waiting for network responses.
15. **Q: Why is `extra='forbid'` enforced on domain contracts?**
    *A:* To prevent silent contract drift between Node.js and Python. Any unexpected or unmapped field passed by Node.js is immediately rejected with HTTP 422.

