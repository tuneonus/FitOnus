# Adding a module

Example: a `projects` module where members own projects. Copy the shape of `src/modules/users`.

## 1. Migration

`migrations/0004_create_projects.sql`, with integrity in the database:

```sql
CREATE TABLE projects (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid        NOT NULL REFERENCES users (id),
  name       text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  version    integer     NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_owner_name_key UNIQUE (owner_id, name)
);
CREATE INDEX projects_owner_idx ON projects (owner_id, created_at DESC);
```

Run `npm run db:migrate`. Never edit a migration after it has been merged; add a new one.

## 2. Permissions

Add `'projects:read-any'` etc. to `PERMISSIONS` in `src/shared/auth/permissions.ts` and grant them in
`ROLE_PERMISSIONS`. Grant nothing to `member` that is not needed.

## 3. Domain (`domain/project.ts`)

Entity type plus pure rules (`normalizeProjectName`, state transitions). No imports from Express, `pg`, Zod.

## 4. Application

- `application/ports.ts`: `ProjectRepository` interface (CAS methods return `null` on conflict).
- `application/project-view.ts`: JSON-safe view (ISO dates, no internal fields).
- `application/use-cases/*.ts`: one class per action. Each one:
  1. checks permission / ownership (`assertPermission`, `assertSelfOrPermission`);
  2. normalises input with domain functions;
  3. does slow work outside a transaction;
  4. wraps multi-step writes in `uow.run(...)`;
  5. returns a view, throws `AppError` with a stable code.
- Needs another module? Declare a port here and have `container.ts` pass that module's public API.

## 5. Infrastructure (`infrastructure/pg-project-repository.ts`)

Parameterised SQL only, explicit column lists, row → entity mapping, translate known constraint violations
(`projects_owner_name_key` → `conflict('PROJECT_NAME_TAKEN', …)`; add the code to `ErrorCode`). Sorting goes
through `orderByClause` with a whitelist.

## 6. Interface

- `interface/projects.schemas.ts`: `z.strictObject` bodies, query/param schemas, response schemas.
- `interface/projects.controller.ts`: arrow functions that call `getValidated`, `requireActor`, one use case, and
  return `{ data, meta?, headers? }`.
- `interface/projects.routes.ts`: `defineRoute` specs with explicit `access`, request/response schemas and
  documented error statuses.

## 7. `index.ts` and registration

```ts
export function createProjectsModule(deps: { basePath: string; db: SqlExecutor; uow: UnitOfWork }) {
  const projects = new PgProjectRepository(deps.db);
  const controller = createProjectsController({
    createProject: new CreateProjectUseCase({ projects, uow: deps.uow }),
  });
  return { routes: createProjectsRoutes(deps.basePath, controller) };
}
```

In `src/container.ts`: create the module with `basePath: API_PREFIX + '/projects'` and add its `routes` to
`routeGroups`. Routes, enforcement and OpenAPI update together.

## 8. Tests

- `tests/unit/projects/*.test.ts`: domain rules and use cases with in-memory fakes (permission denied, ownership,
  conflicts).
- `tests/integration/repositories/*.test.ts`: constraints and concurrent CAS updates against PostgreSQL.
- `tests/integration/http/projects.http.test.ts`: happy path + 400/401/403/404/409 via supertest.

## Checklist

- [ ] Every route has an explicit `access`; non-public ownership is checked in the use case
- [ ] Integrity rules exist as SQL constraints, not only in code
- [ ] Concurrent edits use `version` (compare-and-set); retried creates use `Idempotency-Key` where needed
- [ ] Responses never include secrets/internal columns (response schema)
- [ ] `npm run check` and `npm run test:int` pass; `npm run lint` shows no boundary violations
