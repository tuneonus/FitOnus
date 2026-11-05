# ADR 0001: Modular monolith with Clean Architecture layers

## Status

Accepted.

## Context

The starter must serve unrelated future products whose scale and domain are unknown. Distributed architectures add
network failure modes, distributed transactions, duplicated data and operational cost from day one; most products
never need them, and those that do usually need them for one or two hot spots.

## Decision

One deployable process and one PostgreSQL database, organised into feature modules. Each module has
domain/application/infrastructure/interface layers and a single public `index.ts`. Lint rules enforce the
dependency direction and module boundaries. Modules communicate through in-process public APIs; atomic
cross-module writes use one unit of work.

## Consequences

- Simple local development, testing and deployment; real ACID transactions across modules.
- Clear seams for extracting a module later (its public API becomes a network API; its tables move with it).
- Requires discipline that the linter can only partly enforce (e.g. not sharing tables between modules).
- Scaling is vertical plus stateless replicas until a module is extracted.
