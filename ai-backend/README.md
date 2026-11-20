# OnusFit AI backend (`ai-backend/`)

Internal Python / FastAPI service. The Node.js API calls it to do **AI inference**; mobile and admin
never talk to it.

**What it does today:** (1) generates AI Coach **chat replies** (`POST /internal/v1/ai/coach/chat`); (2) generates **coach insights** (`POST /internal/v1/ai/coach/insights`); (3) parses **voice meals** (`POST /internal/v1/ai/meals/parse-voice`, typed text or an audio clip); (4) analyzes **meal photos** (`POST /internal/v1/ai/meals/analyze-photo`); (5) **transcribes speech** (`POST /internal/v1/ai/speech/transcribe`). For each it
builds the prompt, calls Gemini (primary model, one fallback model, total deadline), parses the reply.

**What it does not do (stays in Node):** authentication, quota/billing, conversation storage, loading
user data, memory consent. It never reads a database and never accepts a user id in a request body.

**Status:** the **only** implementation of every user-facing AI feature: AI Coach chat and insights, voice meal
parsing, meal photo analysis and speech transcription. The Node API has no Gemini fallback: if this service is
down, `POST /coach/chat`, the voice-meal and meal-photo endpoints and `POST /coach/transcribe` return a
controlled 503 and the quota unit is handled by Node's usual refund rules (transcription has no quota gate, as
before). `GET /coach/insights` instead keeps its Node *deterministic* fallback (data-backed insights, no AI) and
still answers 200. Node refuses to start without `AI_BACKEND_URL` and `AI_BACKEND_SERVICE_SECRET`. Not deployed.

Learning guides: [01 integration](../docs/ai/learning/01-python-chat-integration.md) (historical: describes the fallback that was removed), [02 Python-only architecture](../docs/ai/learning/02-python-only-ai-architecture.md) and [03 voice meal](../docs/ai/learning/03-voice-meal-python-migration.md), [04 speech transcription](../docs/ai/learning/04-python-speech-transcription.md), [05 meal photo](../docs/ai/learning/05-python-meal-photo-analysis.md) and [06 coach insights](../docs/ai/learning/06-python-coach-insights.md).
Plan and decisions: [docs/ai/PYTHON_MIGRATION_READINESS.md](../docs/ai/PYTHON_MIGRATION_READINESS.md).

## Layout

```text
ai-backend/
├── pyproject.toml
├── .env.example
├── src/onusfit_ai/
│   ├── main.py            # create_app(): mounts routers, middleware, error handlers (no public /docs)
│   ├── features/          # Feature-based modular clean architecture (features never import each other)
│   │   ├── coach/         # AI Coach feature
│   │   │   ├── domain/           # Fitness profile, chat/insights contracts and models
│   │   │   ├── application/      # Chat and insights use cases + parsers; prompts/ (pure builders)
│   │   │   └── presentation/     # FastAPI routers: /internal/v1/ai/coach/chat, /insights
│   │   ├── meals/         # Nutrition/meals feature
│   │   │   ├── domain/           # Contracts, limits, sanitization rules
│   │   │   ├── application/      # Voice and photo meal use cases + parsers; prompts/
│   │   │   └── presentation/     # FastAPI routers: /internal/v1/ai/meals/parse-voice, /analyze-photo
│   │   └── speech/        # Speech feature
│   │       ├── application/      # Transcription use case, parser, contracts; prompts/
│   │       └── presentation/     # FastAPI router: /internal/v1/ai/speech/transcribe
│   └── shared/            # Cross-cutting code. "Pure" = no framework, no SDK (see Architecture rules)
│       ├── auth/          # Service JWT token verification
│       ├── config/        # Environment and settings configuration                         (pure)
│       ├── contracts/     # Base contract models and shared wire types                     (pure)
│       ├── errors/        # AiError, the one JSON error shape, error handlers
│       ├── health/        # Liveness endpoint (/health/live) and contract
│       ├── llm/           # ports.py (TextGenerator + data types, pure), gemini.py (the adapter), errors.py
│       │                  #   (classifier + cooldown), dependencies.py (FastAPI wiring), telemetry.py
│       ├── logging/       # Structured logging, formatters, masking                         (pure)
│       ├── observability/ # Request middleware, correlation IDs, error categories
│       ├── request_limits/# Request body size cap (413 before auth/parsing)
│       └── utils/         # Audio, image, text, JS-compat helpers; InvalidMediaError        (pure)
└── tests/                 # pytest suite, golden fixtures, architecture and wire-contract tests
```

## Architecture rules

`tests/test_architecture.py` checks these on every run (static imports plus fresh-interpreter imports):

| Layer | May import | Must not import |
|---|---|---|
| `features/<f>/domain` | pydantic, `shared.contracts`, `shared.utils`, its own domain | application, presentation, another feature, FastAPI, Starlette, Gemini SDK, `shared.errors`/`auth`/`llm.gemini` |
| `features/<f>/application` | the above + `shared.llm.ports`, `shared.llm.telemetry`, `shared.logging`, its own domain | presentation, another feature, FastAPI, Starlette, Gemini SDK, `shared.llm.gemini`, `shared.errors` |
| `features/<f>/presentation` | FastAPI, `shared.auth`, `shared.llm.ports`/`dependencies`, its own application/domain | another feature |
| `shared` | other `shared` modules | any feature. Pure modules (listed above) import no framework or SDK |

- Use cases take an `llm: TextGenerator` (the Protocol in `shared/llm/ports.py`); `shared/llm/dependencies.py` is
  the one place that picks the real Gemini client, and tests swap it with `app.dependency_overrides[get_llm]`.
- The audio/image helpers raise `InvalidMediaError`, which knows nothing about HTTP; `shared/errors` turns it into
  the `422 INVALID_REQUEST` (`dispatched: false`) that Node expects.
- `google` (Gemini SDK), `httpx` and `jwt` are imported by exactly one module each (`shared/llm/gemini.py`,
  `shared/llm/errors.py`, `shared/auth/auth.py`).
- The feature packages (`features/<f>/__init__.py`) re-export nothing, so importing a domain or application module
  never loads FastAPI or the Gemini SDK.
- `tests/test_wire_contract.py` pins every Node-facing request and response model to
  `tests/fixtures/contracts/wire_fields.json`; `backend/tests/unit/ai/python-wire-contract.test.ts` checks the
  Node adapters and fakes against the same file. Change a model: regenerate it with
  `UPDATE_CONTRACT_SNAPSHOT=1 .venv/bin/python -m pytest tests/test_wire_contract.py`, then update Node.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `AI_SERVICE_JWT_SECRET` | **yes** | Verifies Node's service token. >= 32 chars; same value as `AI_BACKEND_SERVICE_SECRET` in the Node API. In production a missing or short value stops the service from starting. |
| `GEMINI_API_KEY` | **yes** | Gemini key. Server-side only. In production a missing value stops the service from starting. |
| `ONUSFIT_AI_ENV` | no (default `development`) | `production` turns startup validation into a hard failure (the Docker image sets it). Also shown by `/health/live`. |
| `PORT` | no | Set by Render (default 10000); the container binds `0.0.0.0:$PORT`. |
| `LOG_LEVEL` | no (default `INFO`) | `DEBUG`..`CRITICAL`. Logs are metadata only whatever the level. |
| `LOG_FORMAT` | no (default `json`) | `json`: one JSON object per line (what Render and log tools want; same field names as the Node API). `text`: readable lines for local development. |
| `GEMINI_ATTEMPT_TIMEOUT_S` | no (default `20`) | Max seconds for one Gemini attempt (0 < value <= 60). |
| `AI_SERVICE_JWT_ISSUER` / `AI_SERVICE_JWT_AUDIENCE` | no | Defaults match the Node side (`onusfit-node-api` / `onusfit-ai-backend`). |

## Run locally

```bash
cd ai-backend
uv venv .venv && uv pip install --python .venv/bin/python -e ".[dev]"   # one time; .venv is gitignored
cp .env.example .env                                                     # fill in the two values
set -a; source .env; set +a
.venv/bin/uvicorn onusfit_ai.main:app --host 127.0.0.1 --port 8000
curl http://127.0.0.1:8000/health/live
```

## Docker and deployment

`Dockerfile` (multi-stage, Python 3.12, non-root user 10001, no secrets in the image) and `requirements.txt` (pinned runtime
dependencies) are the production build; `.dockerignore` keeps tests, docs and `.env*` out. See
[docs/render-deployment.md](docs/render-deployment.md) for the Render setup, the Node-to-Python connection and the limits of
free hosting. Nothing is deployed yet.

```bash
docker build -t onusfit-ai-backend .            # run from ai-backend/
docker run --rm -p 10000:10000 -e AI_SERVICE_JWT_SECRET=... -e GEMINI_API_KEY=... onusfit-ai-backend
curl http://127.0.0.1:10000/health/live          # needs no secrets and never calls Gemini
```

## Checks

```bash
.venv/bin/python -m pytest -q
.venv/bin/ruff check . && .venv/bin/ruff format --check .
.venv/bin/mypy
```

## Conventions

- Routes stay thin: validate -> call one function -> return a contract.
- Pydantic models for everything that crosses HTTP; `extra="forbid"` so contract drift is loud.
- Model output is never forwarded unchecked to the app. The coach chat reply's `blocks` field is part of the contract
  but always `null`: the prompt never asks for blocks, and the mobile app renders them (an `action` block runs writes
  after one tap), so a block the model made up is dropped by `features/coach/application/parsing.py`. To bring rich
  blocks back, ask for them in the prompt AND validate each type with its own Pydantic model first.
- Provider SDK code lives only in `shared/llm/` (the `google` import is in `gemini.py` alone).
- Never log message text, memories, replies, tokens or keys; log metadata only. Write events with `log_event` (numbers, booleans, closed lists); `shared/logging/logging.py` masks fields with sensitive names and anything that looks like a key, bearer token or JWT. `tests/test_observability.py` plants sentinel user content on all five endpoints and fails if any reaches the logs.
- Runtime dependencies are pinned in `requirements.txt` (what the image installs); change them in `pyproject.toml`, then regenerate it (see its header).
- A new folder is added when its first real file exists, never in advance.
- Prompt changes: bump `PROMPT_VERSION` and regenerate the golden fixtures (`tests/fixtures/coach_chat/`, `voice_meal/`, `transcribe/`) in the same change.
