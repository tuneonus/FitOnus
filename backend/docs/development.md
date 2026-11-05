# Development and testing

## Local setup (Windows PowerShell)

```powershell
node --version                      # 22.22 or newer 22.x LTS
cd E:\Web\generic-backend
npm ci
Copy-Item .env.example .env
# Edit .env: set POSTGRES_PASSWORD (and the same password inside DATABASE_URL), JWT_ACCESS_SECRET, HMAC_SECRET.
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # generate a secret
docker compose up -d db
npm run db:migrate
npm run db:seed                     # uses SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD from .env
npm run dev
```

`LOG_PRETTY=true` gives human-readable logs locally (refused in production). Stop the database with
`docker compose stop db`; `docker compose down -v` deletes its volume.

Without Docker, point `DATABASE_URL` at any local PostgreSQL 16+ you control.

## Testing

| Command            | Scope                                                                                               | Needs                                               |
| ------------------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `npm test`         | Unit: domain rules, use cases with in-memory fakes, permissions, JWT service, HTTP plumbing, config | Nothing                                             |
| `npm run test:int` | Migrations, transactions, repositories, constraints, concurrency, idempotency, full HTTP flows      | Docker (Testcontainers starts `postgres:17-alpine`) |

Every integration test file creates its own database `test_<random>`, migrates it, and drops it afterwards, so
files run in parallel and never share state.

No Docker? Provide a local server you own:

```powershell
$env:TEST_DATABASE_ADMIN_URL = "postgres://postgres:<password>@127.0.0.1:5432/postgres"
npm run test:int
Remove-Item Env:TEST_DATABASE_ADMIN_URL
```

The override is refused unless the host is `localhost`/`127.0.0.1`/`::1`, and tests only create and drop
`test_*` databases. Never point tests at a shared or production server.

### What to test where

- **Domain**: pure functions, no fakes needed.
- **Use cases**: permissions, ownership, orchestration and error codes with fakes from `tests/helpers/fakes.ts`.
- **Repositories**: real SQL, constraints and concurrent writers (`Promise.all`), against PostgreSQL.
- **HTTP**: one happy path plus the security-relevant failures (401/403/400/409) per endpoint via supertest.

## Code style

- `npm run lint` includes architecture-boundary rules; fix them by moving code, not by disabling the rule.
- `npm run format` (Prettier). `.gitattributes` forces LF so formatting and migration checksums match on Windows.
- Comments: one or two lines explaining _why_, not what.
