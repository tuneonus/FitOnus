# Authentication and authorization

## Account creation policy

- **Admin-controlled (default)**: `POST /api/v1/users` requires `users:create`. Assigning any role other than
  `member` additionally requires `users:assign-role`. The first admin comes from `npm run db:seed` (development)
  or a one-off operational script in production.
- **Self-service**: `POST /api/v1/auth/register` works only when `AUTH_PUBLIC_REGISTRATION=true`. New accounts are
  always `member`. Production refuses to start unless this variable is set explicitly.
- Self-registration currently reveals whether an e-mail is taken (409). If enumeration matters, add e-mail
  verification (see extension points below) and return the same response either way.

## Tokens and sessions

| Item          | Format                                                                                    | Lifetime                                                         | Storage                                                                  |
| ------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Access token  | JWT, HS256, claims `sub` (user id), `sid` (session id), `iss`, `aud`, `iat`, `exp`, `jti` | `ACCESS_TOKEN_TTL_SECONDS` (default 15 min)                      | Client memory only; never stored server-side                             |
| Refresh token | `<sessionId>.<256-bit random secret>` (opaque)                                            | `REFRESH_TOKEN_TTL_DAYS` (default 30), extended on each rotation | Server stores only `HMAC-SHA256(HMAC_SECRET, secret)` in `auth_sessions` |

Verification pins the algorithm (`HS256`), issuer, audience and `typ`. `alg: none` and other algorithms are rejected
(see `tests/unit/auth/tokens.test.ts`).

### Every authenticated request (fail closed)

1. Verify the JWT signature and claims.
2. Load the session by `sid`: it must exist, belong to `sub`, be unrevoked and unexpired.
3. Load the account: it must exist and be `active`. The role (and therefore permissions) comes from the database,
   not the token, so role changes apply on the next request.

Any failure, including a database error, rejects the request. There is no development bypass.

### Rotation and replay detection

`POST /auth/refresh` accepts a refresh token once. The session's stored hash is swapped with a compare-and-set
(`WHERE refresh_token_hash = <current>`). If a token that was already rotated is presented again, or two requests
race with the same token, the session is revoked (`token_reuse`) and both the attacker and the legitimate client
must sign in again. Trade-off: a client that retries a refresh after a network failure will be logged out; clients
should serialise refreshes.

### Revocation semantics

| Action                       | Effect                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `POST /auth/logout`          | Revokes the current session. Its access token stops working **immediately** (step 2 above). |
| `POST /auth/logout-all`      | Revokes every session of the user.                                                          |
| `DELETE /auth/sessions/:id`  | Revokes one of the caller's own sessions; another user's id returns 404.                    |
| `POST /auth/change-password` | Requires the current password; revokes every _other_ session in the same transaction.       |
| Disable user                 | All requests and refreshes for the account fail with `ACCOUNT_DISABLED` immediately.        |

### Brute-force and enumeration protection

- Login is rate-limited per IP **and** e-mail (`AUTH_RATE_LIMIT_MAX` per window), so one attacker cannot lock out an
  account for everyone. Register, refresh and change-password have their own budgets.
- Unknown e-mail and wrong password return the same `401 INVALID_CREDENTIALS`; unknown e-mails still run an Argon2
  verification against a dummy hash to equalise timing.
- `ACCOUNT_DISABLED` is only revealed after a correct password.

### Logging

`Authorization`, cookies, `Idempotency-Key`, and any `password`, `token`, `accessToken`, `refreshToken` or
`passwordHash` field are redacted by pino. Request logs contain the path without the query string.

## Authorization model

- Permissions are strings (`users:read`, `users:create`, `users:update`, `users:manage-status`,
  `users:assign-role`), granted to roles in `src/shared/auth/permissions.ts`. The `admin` role is just a list of
  grants; no code ever checks a role name.
- Every route declares `access`: `public`, `authenticated`, or `{ kind: 'permission', permission }`. There is no
  default, so forgetting is a type error, and the OpenAPI document shows the requirement.
- Resource ownership ("you may edit your own profile, or anyone's with `users:update`") is enforced in use cases
  with `assertSelfOrPermission`, because only the use case knows which resource is affected.

## Security limitations (known and accepted for a starter)

- HS256 with one shared secret: fine while one service signs and verifies. Use EdDSA/RS256 and a JWKS endpoint if
  other services must verify tokens. Rotating `JWT_ACCESS_SECRET` invalidates all access tokens (they are short-lived;
  refresh tokens keep working because they are not JWTs). Rotating `HMAC_SECRET` invalidates all refresh tokens.
- Refresh tokens are returned in the JSON body. Browser clients should keep them out of `localStorage`; if you switch
  to cookies, use `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth` and add CSRF protection.
- No MFA, e-mail verification, password reset or account lockout beyond rate limiting. These need a delivery
  provider and are left as extension points (below).
- Rate limits are per process; use a shared store when you run several instances.

## Extension points

| Need                                 | Where                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-mail verification / password reset | New `auth` use cases + a `NotificationSender` port in `auth/application/ports.ts`; store single-use hashed tokens with expiry like refresh tokens |
| OTP / SMS / MFA                      | Same pattern: a provider port, hashed codes with attempt counters updated atomically, per-identifier rate limits                                  |
| OAuth / SSO                          | An infrastructure adapter that resolves an external identity to an account, then `SessionIssuer.issue()`                                          |
| Runtime-editable roles               | Move `ROLE_PERMISSIONS` into tables; keep `Actor.permissions` and `requirePermission` unchanged                                                   |
