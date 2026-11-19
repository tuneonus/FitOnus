# Deploying the AI backend on Render

**Status:** preparation only. **Nothing has been deployed**, and no Render setting or Node environment variable has been changed. This guide is what you do, by hand, when you decide to deploy.

Statements marked **(verified)** were read in Render's documentation on 2026-11-19 (`render.com/docs`: free, web-services, private-network, private-services, health-checks, docker, monorepo-support). Statements marked **(unverified)** could not be confirmed from those pages: check them in your Render dashboard before relying on them. Prices are deliberately not quoted (Render's pricing page did not expose them to me): read the current numbers on render.com/pricing.

---

## 1. What you are deploying

`ai-backend/` is an internal FastAPI service. The Node API calls it for **every** AI feature (coach chat, coach insights, voice meal, meal photo, speech transcription); the app and the admin console never talk to it. It has no database. Its only secrets are the Gemini key and the shared token secret.

```
Phone ──HTTPS──► Node API (Render, already hosted) ──signed 30 s token──► AI backend (this service) ──► Gemini
```

## 2. Choose the service type first

| | Free Web Service | Paid Web Service | Paid **Private** Service |
|---|---|---|---|
| Public `onrender.com` URL | yes | yes | **no** (not reachable from the internet) (verified) |
| Reachable from your Node service | over the public internet only | public URL, or privately | **privately** (internal host) |
| Can receive private-network traffic | **no** (verified) | yes (verified) | yes (verified) |
| Always on | **no: spins down after 15 min without traffic; ~1 min to spin up** (verified) | yes (unverified: paid instances do not spin down; confirm on the plan page) | yes (same caveat) |
| Health check | HTTP path | HTTP path | **TCP only** (verified) |
| Free tier | yes | – | **not available on Free** (verified) |

**Why Free is not suitable beyond a demo:** after 15 idle minutes the first request waits about a minute for the service to wake, but Node gives up after 22 to 27 seconds. So the first chat, voice, photo or transcription request after a quiet period fails with the "AI is temporarily unavailable" error, and insights silently fall back to the simple deterministic ones. Free instances can also be restarted at any time, run a single instance, and 750 instance-hours per month are shared by the workspace (all verified).

**Recommended:** a paid **Private Service** in the **same region and same workspace** as the Node API (verified requirement for private networking). It has no public attack surface, and the token check still applies. If your Node API turns out to be in another region or workspace, use a paid **Web Service** (public HTTPS URL, protected by the token) instead. *(You need to check which region and workspace your Node service uses; I could not.)*

## 3. Create the service (dashboard, step by step)

1. **New → Private Service** (recommended) or **Web Service**, connect the GitHub repository.
2. **Name:** e.g. `onusfit-ai-backend` (this becomes the internal host name).
3. **Region:** the same as the Node API.
4. **Branch:** the branch you deploy from. (Your work is on `development`, not pushed; nothing is on any remote yet.)
5. **Root Directory:** `ai-backend`. For Docker services the Dockerfile Path and the build context are resolved **relative to the Root Directory** (verified), so:
6. **Language / Runtime:** **Docker**. **Dockerfile Path:** `./Dockerfile`. Leave any build-context setting at its default (`.` = `ai-backend/`).
7. **Docker Command:** leave **empty**. The image's `CMD` already runs `uvicorn onusfit_ai.main:app --host 0.0.0.0 --port ${PORT:-10000}` (see §5).
8. **Instance type:** a paid type (see §2). The service is light on CPU (it waits for Gemini); a request can hold up to ~15 MB of base64 audio or ~10 MB of image in memory several times over while it is decoded, so avoid the smallest memory tier if you can and watch memory in Render's metrics (this is an estimate, not a measurement).
9. **Health Check Path** (Web Service only): `/health/live`. It needs no token and never calls Gemini. A `2xx`/`3xx` in under 5 seconds is healthy (verified). A Private Service uses a TCP check on its port instead.
10. **Auto-Deploy:** start with **Off** (manual deploys). When you turn it on, add a build filter that includes `ai-backend/**`; filter paths are relative to the repository root (verified), so Node-only commits will not redeploy the AI service.
11. **Environment variables:** §4. Set them **before** the first deploy.
12. Create the service. Render builds the image with BuildKit on every deploy (verified) and `.dockerignore` is respected, so tests, docs and `.env*` files are not in the image.

Keep **one instance**. The replay-protection cache for tokens and the Gemini model cool-down live in the process's memory, so two instances would each have their own copy (replay protection becomes per-instance and a failing model is only skipped by the instance that saw it). The Dockerfile also starts a single worker on purpose.

## 4. Environment variables

### On the AI backend service (Render → the service → Environment)

| Variable | Required | Value | Notes |
|---|---|---|---|
| `AI_SERVICE_JWT_SECRET` | **yes** | a random string, ≥ 32 characters | Generate: `python3 -c "import secrets; print(secrets.token_urlsafe(36))"`. Mark as a secret. Must be **identical** to Node's `AI_BACKEND_SERVICE_SECRET`. |
| `GEMINI_API_KEY` | **yes** | your Gemini API key | A key of its own for this service is cleaner (own quota, own cost, easy to revoke). It is **not** the key stored in the admin console: Node's admin key no longer reaches Python (readiness decision O1 is still open). |
| `ONUSFIT_AI_ENV` | no | `production` | Already set inside the image. With it the service **refuses to start** if the two required values are missing or too short, so a bad deploy fails visibly. |
| `LOG_LEVEL` | no | `INFO` (default) | Logs contain metadata only, at any level. |
| `LOG_FORMAT` | no | `json` (default) | One JSON object per line: what you want on Render. `text` is for local development. An unknown value stops a production start. |
| `GEMINI_ATTEMPT_TIMEOUT_S` | no | `20` (default) | Longest single Gemini attempt. Leave unless you have measured a reason. |
| `AI_SERVICE_JWT_ISSUER`, `AI_SERVICE_JWT_AUDIENCE` | no | leave unset | Must match the Node code's constants. |
| `PORT` | **do not set** | – | Render sets it (default `10000`, verified). The container listens on `0.0.0.0:$PORT`. |

Never put a secret in the Dockerfile, in a build argument, or in the repository. (Render turns environment variables into Docker build arguments too (verified); the Dockerfile does not reference any, so nothing secret is baked into a layer.)

### On the existing Node API service: **not changed by me**

Node refuses to start without these two, so **set them on the Node service before you deploy the Node code from this branch**, otherwise that deploy will crash on startup:

| Variable | Value |
|---|---|
| `AI_BACKEND_URL` | Private Service or private-network Web Service: the **Internal** address shown in the AI service's **Connect** menu, e.g. `http://onusfit-ai-backend-xxxx:10000` (Render's docs show the form `http://<host>:10000`; use `http://`, no TLS inside the private network (verified)). Public Web Service: `https://<name>.onrender.com`. Trailing slashes are ignored. |
| `AI_BACKEND_SERVICE_SECRET` | the same value as the AI service's `AI_SERVICE_JWT_SECRET` (≥ 32 characters). |
| `AI_BACKEND_TIMEOUT_MS` | optional; default `25000`, maximum `28000`. Each feature also caps it below the app's own wait (insights 22 s, voice meal 22 s, meal photo 27 s). Leave the default. |

Nothing else changes on the Node side.

## 5. Build, start and port (what the image does)

- **Build:** `pip install -r requirements.txt` (40 exactly pinned runtime packages: the versions the test suite ran against) and then the app itself. No compiler is needed.
- **Start:** `sh -c "exec uvicorn onusfit_ai.main:app --host 0.0.0.0 --port ${PORT:-10000} --timeout-keep-alive 65 --no-server-header"`. Render requires binding to `0.0.0.0` and recommends using `PORT` (default 10000) (verified).
- **User:** non-root (`uid 10001`, no shell, no home).
- **Startup validation:** in production the process exits with code 3 and a message naming the wrong variable (never its value) when the secret or key is missing or invalid; Render then shows a failed deploy and keeps the previous version serving (verified: a deploy that never becomes healthy is cancelled and existing instances keep serving traffic).
- **Logs:** one JSON object per line on stdout (Render collects it), the same field names as the Node API. Events: `service.starting` (startup facts as booleans), `ai.call.completed` (one per answered call: `feature`, `model`, `modelFallbackUsed`, `outcome`, token counts, `geminiDurationMs`), `ai.request.failed` (auth, validation and Gemini failures, with an `errorCategory`), `ai.gemini.attempt_failed` / `ai.gemini.model_skipped` (a model attempt failed, or a cooling-down model was skipped), `http.request` (method, path, status, duration; `/health` is not logged). Every line of a request carries `correlationId` (the Node request id, from `X-Correlation-Id`), `aiRequestId` and `feature`. Prompts, user data, images, audio, replies, tokens, keys and user ids are never logged; fields with sensitive names are masked and anything that looks like a Google key, a bearer token or a JWT is masked as a last defence. Uvicorn's own access and traceback lines are separate and not structured. Field list and search recipes: `docs/ai/learning/07-ai-observability.md`.
- **Docs pages:** `/docs`, `/redoc` and `/openapi.json` do not exist.

## 6. How Node authenticates to Python (service JWT)

1. For **every** call Node signs a new token with the shared secret (HS256): issuer `onusfit-node-api`, audience `onusfit-ai-backend`, subject = the user's id, a unique `jti`, **30 s lifetime**, and a **scope that names one endpoint** (`ai:coach:chat`, `ai:coach:insights`, `ai:meals:voice`, `ai:meals:photo`, `ai:speech:transcribe`).
2. Python rejects: a wrong secret or algorithm, a wrong issuer or audience, an expired token or one that lives longer than 60 s, a token for a different endpoint, and any token it has already seen (replay). It always answers with the same vague `401 Invalid service token.`; the user id in the body is never trusted (there is none).
3. If the secret is missing or short, Python answers `503` to everything instead of accepting anything. In production it does not even start.

**Rotating the secret:** there is no overlap window (a single secret is accepted at a time). Change `AI_SERVICE_JWT_SECRET` and Node's `AI_BACKEND_SERVICE_SECRET` to the same new value and redeploy both; between the first and the second redeploy AI calls fail (chat, voice, photo and transcription show the "temporarily unavailable" error; insights fall back to the simple version). Do it in a quiet period. Supporting two secrets at once is a possible future improvement.

**If the AI service is exposed publicly** (Web Service) the token is the only barrier: use a long random secret, never reuse it elsewhere, and keep `/docs` off (it is).

## 7. Verifying after you deploy (manual)

1. In the AI service **Logs**, look for the `service.starting` line (`"environment":"production"`, `"geminiKeyConfigured":true`, `"serviceSecretConfigured":true`) and `Uvicorn running on http://0.0.0.0:<port>`.
2. Web Service: `curl https://<name>.onrender.com/health/live` → `{"status":"ok",…,"environment":"production"}`. Private Service: it cannot be reached from your laptop; rely on Render's health state plus step 4.
3. Set the two variables on the Node service and deploy it.
4. Use the app (or the admin tools) to trigger **coach insights** first (with `refresh=true`), then chat: the AI service logs should show `ai.call.completed` lines with `"feature":"coach_insights"` / `"coach_chat"` and `"outcome":"ok"`, and the answers should not be the plain "deterministic" insights (ids starting `ins-det-`).
5. Check the Node logs for `ai.call.completed` events and no `ai.call.failed` events. A failure's `errorCategory` tells you: `python_unavailable` = wrong URL/port/region or a sleeping free service; `auth_failure` = secret mismatch; `python_timeout` = slow Gemini or a cold start. To follow one request across both services, search for its `correlationId` (the `X-Request-Id` the app received).

## 8. Rollback

- AI service: in Render, redeploy the previous successful deploy (Deploys tab). A failed deploy never replaces the running one.
- Node: the AI features have **no Node Gemini fallback any more**. Rolling back to a Node build from before these migrations (the Node build currently on Render may be one; I could not check) means those older builds, which talk to Gemini directly, and the AI service is simply not called.

## 9. Known limits and risks (read before going live)

- **Cold starts on Free** (§2) break the first request after idle. Use a paid instance.
- **Latency:** coach insights took 15 to 16 s per generation in the live test, against a 20 s Gemini attempt limit and the app's 25 s wait. A slow Gemini moment turns into the simple deterministic insights, with no error, so quality can degrade unnoticed: watch for `ai.deterministic_fallback` and `"errorCategory":"invalid_ai_response"` events in the Node logs (`ai.call.failed` shows failures).
- **Single instance, in-memory state** (§3).
- **Memory:** large audio and image requests (up to 15 MB and 10 MB of base64) are decoded in memory; a handful of concurrent large uploads on a small instance could exhaust memory (estimate, not measured: watch Render's metrics during a test).
- **One shared secret, no overlap** (§6).
- **Gemini key and quota:** put a spending/quota alert on the Gemini key in Google's console; Node's per-user daily quotas stay the main cost control. The admin console's key and model choices still apply to **which models** are used (Node sends the names) but not to the key itself.
- **Build reproducibility:** the base image is pinned by tag, not by digest (`python:3.12-slim-bookworm`); pin a digest when you want fully reproducible builds. The pinned requirements cover the Python packages.
- **No alerting yet:** Render's built-in failure notifications are the only alarm. Add log-based or uptime alerts before real traffic.
- **Health probes use GET.** `HEAD /health/live` answers 405 (Render uses GET (verified); configure any external uptime monitor with GET).

## 10. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Deploy fails, logs say `invalid configuration: …` | The named variable is missing or invalid (see §4). The message never shows the value. |
| Deploy fails at `pip install` | A pinned package has no wheel for the build platform: regenerate `requirements.txt` (its header explains how) and run the checks. |
| Node logs `ai.call.failed` with `errorCategory` `python_unavailable` (`errorKind` `unreachable`) | Wrong `AI_BACKEND_URL` or port, different region/workspace, or the free service is asleep. |
| Node logs `errorCategory` `auth_failure` (`errorKind` `auth`) | `AI_BACKEND_SERVICE_SECRET` ≠ `AI_SERVICE_JWT_SECRET`, or the service has the old secret loaded (redeploy after changing it). |
| AI service logs `AUTH_NOT_CONFIGURED` / Node `errorCategory` `auth_failure` or `gemini_auth` (`errorKind` `misconfigured`) | The service is running without a valid secret (only possible outside production). |
| Node logs `errorCategory` `python_timeout` on first use | Cold start (free) or Gemini slowness. |
| Everything works but insights look generic | They are the deterministic fallback: check the Node logs for `ai.deterministic_fallback` (its `reason` and `errorCategory` say why) and the AI service logs for `"outcome":"unusable"`, the Gemini key, and the model names in the admin console. |

## 11. Your checklist (manual actions)

- [ ] Decide the hosting type (§2) and confirm the Node service's region and workspace.
- [ ] Generate the shared secret (§4) and a Gemini key for this service.
- [ ] Create the Render service (§3) with the variables; deploy it; check the logs (§7).
- [ ] Set `AI_BACKEND_URL` and `AI_BACKEND_SERVICE_SECRET` on the Node service **before** deploying the Node code from this branch.
- [ ] Push the branch and open the pull request so the new CI workflow (`.github/workflows/ai-backend.yml`) runs, including the Docker build and the container smoke test that could not be run on the development machine.
- [ ] Put a quota alert on the Gemini key.

I did not add a `render.yaml` Blueprint: a Blueprint is applied automatically and I did not want an untested file to be able to change production settings. It can be added once the manual setup has worked.
