# ADR 0002: Raw SQL with `pg`, no ORM

## Status

Accepted.

## Context

ORMs speed up CRUD but hide query shape, encourage lazy loading and make locking/conditional updates awkward.
The patterns this starter must demonstrate (compare-and-set, `ON CONFLICT` claims, advisory locks, partial
indexes) are plain SQL features.

## Decision

Repositories use `pg` with parameterised SQL, explicit column lists and hand-written row mapping. Transactions are
provided by a small AsyncLocalStorage unit of work. Dynamic SQL is limited to whitelisted identifiers.

## Consequences

- Every query is reviewable and tunable; no hidden queries.
- More code per repository; schema/type drift is caught by repository integration tests, not by a generator.
- A typed query builder (e.g. Kysely) can be introduced per repository later without changing ports.
