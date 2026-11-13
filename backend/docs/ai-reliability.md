# AI reliability: timeouts, per-user rate limits, telemetry

Every call that can reach Gemini (coach chat, coach insights, meal photo, voice meal) goes through one
choke point, `AiUsageGate.run` (`src/shared/ai/ai-usage.ts`). In order:

1. **Global per-IP limiter** (`app.ts`, unchanged): coarse flood protection for every route.
2. **Auth + validation**: invalid requests never reach the gate and cost nothing.
3. **Per-user burst limit** (`src/shared/ai/ai-rate-limit.ts`): in-memory, no database round trip.
4. **Feature flag + atomic daily quota** (PostgreSQL, Step 1).
5. **Provider call under a hard timeout** (`src/shared/ai/ai-timeout.ts`).
6. **Telemetry** row in `gemini_usage_events`, attributed to the authenticated user.

## Gemini timeout

| Operation | Timeout |
| --- | --- |
| Coach chat, coach insights, voice meal (text) | 20 s |
| Meal photo, voice meal (audio) | 25 s |

`GeminiClient.generate` is the only place that calls the provider. It forwards an `AbortSignal` to the
request (`config.abortSignal`), so at the deadline the HTTP call is cancelled, and the caller also stops
waiting even if the SDK ignored the signal. Properties:

- One provider request per call. There is no retry and no second request after a timeout.
- A timeout is the same safe response for text, image and audio, on the runtime-service and direct-key
  paths: HTTP 503, code `SERVICE_UNAVAILABLE`, message `AI request timed out. Please try again.` No model,
  key, URL or provider text is ever included.
- Charging is unchanged: the unit is consumed once the provider was dispatched (a timeout is billable) and
  refunded only for failures before dispatch.
- Coach insights deliberately catch provider failures, including timeouts, and return deterministic
  fallback insights (HTTP 200, cached 10 minutes). That existing behaviour is preserved.

## Per-user rate limits

Keyed by `ai:<action>:<userId>` where the user id is the authenticated user. Not the IP address (users behind
one carrier NAT do not share a budget) and not any part of the access token (refreshing or re-issuing tokens
does not create a new budget).

| Action | Limit per user per 15 min |
| --- | --- |
| `coach_chat` (chat and insights regeneration share it) | 30 |
| `meal_photo` | 10 |
| `voice_meal` | 10 |
| `workout_generator` | 10 |

Rejections are HTTP 429, code `RATE_LIMITED`, message `Too many requests. Try again later.` (the same code and
text as the global limiters) plus `details.retryAfterSeconds`. A rejected request reserves no quota, creates
no conversation or message and calls no provider. Cached insight reads call no provider and are not counted.

### Limitation: in-memory counters and multiple instances

Counters live in the memory of one API process. With N instances (for example Render scaled out) each keeps
its own counters, so a user's effective burst budget is up to N x the limit, and counters reset when an
instance restarts or redeploys. The **daily AI quota is not affected**: it is an atomic PostgreSQL counter,
exact across instances, and remains the hard cap on spend. The burst limit is abuse protection, not billing.

To make it exact across instances without code changes elsewhere, implement `AiRateLimitStore` on a shared
store (Redis: `INCR key`, `PEXPIRE key windowMs` on the first hit) and pass it to `createAiRateLimiter`.
No Redis is required today.

Limits are code defaults. Making them environment-configurable needs `config/env.ts` and `container.ts`.

## Telemetry

`GeminiRuntimeService.executeWithTelemetry` writes one `gemini_usage_events` row per provider request, with
the user id taken from the gate's request context (AsyncLocalStorage, safe under concurrency) and the
operation type (`coach_chat`, `coach_insights`, `meal_photo`, `voice_meal`). Statuses: `success`, `failed`,
`rate_limited` (provider 429), `timeout`. Requests rejected before the provider (rate limit, quota, kill
switch, missing key) record no row. A call made outside the gate is recorded with a null user, never a wrong one.
