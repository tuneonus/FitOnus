# API conventions

Base path: `/api/v1`. The live OpenAPI 3.1 document is served at `GET /api/v1/openapi.json`; load it into any
OpenAPI viewer (Swagger UI, Redoc, Insomnia, Postman).

## Envelopes

Success:

```json
{ "success": true, "data": {}, "message": "Success" }
```

Paginated lists add `meta`:

```json
{
  "success": true,
  "data": [],
  "message": "Success",
  "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 }
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The request is invalid.",
    "requestId": "…",
    "details": []
  }
}
```

`details` appears only for client errors whose details are safe (validation issues, `currentVersion` on conflicts).
5xx responses never include details, stack traces, SQL or constraint names. Every response carries `X-Request-Id`.

## Status codes and error codes

| Status | Codes                                                                                                                                          |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `VALIDATION_FAILED`, `INVALID_JSON`, `PASSWORD_POLICY_VIOLATION`, `BAD_REQUEST`                                                                |
| 401    | `UNAUTHENTICATED`, `INVALID_TOKEN`, `TOKEN_EXPIRED`, `SESSION_REVOKED`, `INVALID_CREDENTIALS`, `REFRESH_TOKEN_INVALID`, `REFRESH_TOKEN_REUSED` |
| 403    | `FORBIDDEN`, `ACCOUNT_DISABLED`, `REGISTRATION_DISABLED`                                                                                       |
| 404    | `ROUTE_NOT_FOUND`, `USER_NOT_FOUND`, `SESSION_NOT_FOUND`, `NOT_FOUND`                                                                          |
| 405    | `METHOD_NOT_ALLOWED` (with an `Allow` header)                                                                                                  |
| 409    | `EMAIL_ALREADY_EXISTS`, `VERSION_CONFLICT`, `INVALID_STATE_TRANSITION`, `IDEMPOTENCY_REQUEST_IN_PROGRESS`, `CONFLICT`                          |
| 413    | `PAYLOAD_TOO_LARGE`                                                                                                                            |
| 422    | `IDEMPOTENCY_KEY_REUSED`, `CANNOT_CHANGE_OWN_STATUS`, `INVALID_CREDENTIALS` (change-password)                                                  |
| 429    | `RATE_LIMITED` (with `RateLimit` / `RateLimit-Policy` headers)                                                                                 |
| 500    | `INTERNAL_ERROR`                                                                                                                               |
| 503    | `SERVICE_UNAVAILABLE`                                                                                                                          |

Codes are stable: clients may branch on them. Add new codes; never rename existing ones.

## Endpoints

| Method | Path                           | Access                                                                                                                |
| ------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| GET    | `/health/live`                 | public                                                                                                                |
| GET    | `/health/ready`                | public (checks PostgreSQL; 503 while shutting down)                                                                   |
| GET    | `/api/v1/openapi.json`         | public                                                                                                                |
| POST   | `/api/v1/auth/register`        | public, only if `AUTH_PUBLIC_REGISTRATION=true`                                                                       |
| POST   | `/api/v1/auth/login`           | public, rate-limited                                                                                                  |
| POST   | `/api/v1/auth/refresh`         | public, rate-limited                                                                                                  |
| POST   | `/api/v1/auth/logout`          | authenticated                                                                                                         |
| POST   | `/api/v1/auth/logout-all`      | authenticated                                                                                                         |
| GET    | `/api/v1/auth/sessions`        | authenticated (own sessions)                                                                                          |
| DELETE | `/api/v1/auth/sessions/:id`    | authenticated (own sessions)                                                                                          |
| POST   | `/api/v1/auth/change-password` | authenticated, rate-limited                                                                                           |
| POST   | `/api/v1/users`                | `users:create` (+ `users:assign-role` for non-member roles); `Idempotency-Key` supported                              |
| GET    | `/api/v1/users`                | `users:read`; `page`, `limit` (≤100), `search`, `status`, `role`, `sort` (`createdAt`/`email`/`displayName`), `order` |
| GET    | `/api/v1/users/me`             | authenticated                                                                                                         |
| PATCH  | `/api/v1/users/me`             | authenticated; body `{ displayName, version }`                                                                        |
| GET    | `/api/v1/users/:id`            | self, or `users:read`                                                                                                 |
| PATCH  | `/api/v1/users/:id`            | self, or `users:update`; body `{ displayName, version }`                                                              |
| POST   | `/api/v1/users/:id/disable`    | `users:manage-status`; not on yourself                                                                                |
| POST   | `/api/v1/users/:id/enable`     | `users:manage-status`; not on yourself                                                                                |

## Request rules

- JSON only; bodies over `BODY_LIMIT` (default 100 kB) are rejected.
- Request bodies are **strict**: unknown fields are a 400 (prevents mass assignment).
- Query strings use the simple parser (no nested objects).
- Responses are parsed through their response schema before sending, so fields that are not declared (such as
  `passwordHash`) can never leak.
