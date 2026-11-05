# ADR 0003: Short-lived JWTs backed by database sessions

## Status

Accepted.

## Context

Pure stateless JWTs cannot be revoked before they expire; revocation lists in a cache tend to fail open when the
cache is unavailable. The starter must support immediate logout, disabling accounts and role changes.

## Decision

Access JWTs (15 minutes) carry a session id. Every authenticated request verifies the JWT and then loads the session
and the account from PostgreSQL; any failure rejects the request. Refresh tokens are opaque, single-use, stored as
HMAC hashes, rotated with compare-and-set, and replay revokes the session.

## Consequences

- Revocation and permission changes are immediate and fail closed.
- Two indexed queries per authenticated request. If that becomes a bottleneck, add a short-TTL cache with explicit
  invalidation on revoke/disable/role change, and keep the database as the source of truth.
- Clients must serialise refresh calls; a duplicated refresh logs the user out by design.
