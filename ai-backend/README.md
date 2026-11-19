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
│   ├── main.py            # create_app(): mounts routers + error handlers (no public /docs)
│   ├── api/               # thin HTTP routes
│   │   ├── health.py      #   GET  /health/live
│   │   ├── coach_chat.py  #   POST /internal/v1/ai/coach/chat
│   │   ├── coach_insights.py #  POST /internal/v1/ai/coach/insights
│   │   ├── voice_meal.py  #   POST /internal/v1/ai/meals/parse-voice
│   │   ├── meal_photo.py  #   POST /internal/v1/ai/meals/analyze-photo
│   │   └── transcribe.py  #   POST /internal/v1/ai/speech/transcribe
│   ├── contracts/         # Pydantic request/response models (no logic)
│   ├── coach/             # chat (chat.py, parsing.py) and insights (insights.py, insights_parsing.py) use cases
│   ├── meals/             # voice meal (voice.py, parsing.py) and meal photo (photo.py, photo_parsing.py) use cases
│   ├── speech/            # transcription use case (transcribe.py) + reply parsing (parsing.py)
│   ├── prompts/           # versioned prompt text (ported 1:1 from Node): coach_chat.py, coach_insights.py, voice_meal.py, meal_photo.py, transcribe.py
│   ├── llm/               # the ONLY code that talks to Gemini (+ error classifier, cooldown)
│   └── core/              # settings, service-token auth, error type, js_compat.py (JavaScript-equivalent number/string rules)
└── tests/                 # pytest; tests/fixtures/coach_chat/ holds golden files shared with Node
```

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `AI_SERVICE_JWT_SECRET` | **yes** | Verifies Node's service token. >= 32 chars; same value as `AI_BACKEND_SERVICE_SECRET` in the Node API. In production a missing or short value stops the service from starting. |
| `GEMINI_API_KEY` | **yes** | Gemini key. Server-side only. In production a missing value stops the service from starting. |
| `ONUSFIT_AI_ENV` | no (default `development`) | `production` turns startup validation into a hard failure (the Docker image sets it). Also shown by `/health/live`. |
| `PORT` | no | Set by Render (default 10000); the container binds `0.0.0.0:$PORT`. |
| `LOG_LEVEL` | no (default `INFO`) | `DEBUG`..`CRITICAL`. Logs are metadata only whatever the level. |
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
- Provider SDK code lives only in `llm/`.
- Never log message text, memories, replies, tokens or keys; log metadata only (`core/logging.py` also masks anything that looks like a key or token).
- Runtime dependencies are pinned in `requirements.txt` (what the image installs); change them in `pyproject.toml`, then regenerate it (see its header).
- A new folder is added when its first real file exists, never in advance.
- Prompt changes: bump `PROMPT_VERSION` and regenerate the golden fixtures (`tests/fixtures/coach_chat/`, `voice_meal/`, `transcribe/`) in the same change.
