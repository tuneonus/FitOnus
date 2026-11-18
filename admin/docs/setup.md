# Admin setup

The admin dashboard uses Next.js and calls the FitOnus backend. Use the Node version required by `backend/package.json` when running the whole repository.

## Backend

Install dependencies in `backend/` with `npm ci`. Copy `backend/.env.example` to a local `.env` when configuring a new development environment, and supply development credentials. Include the admin origin in `CORS_ORIGINS`; `http://localhost:3001` is the origin used below.

Run `npm run dev` from `backend/`. Database provisioning, migrations, and administrator creation are separate setup actions described in [backend development](../../backend/docs/development.md) and [deployment](../../backend/docs/deployment.md). Use an authorized administrator account; this guide does not provide shared login credentials.

## Dashboard

From `admin/`, run `npm ci`. Configure `admin/.env.local` for the intended API:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1/admin
```

Start the dashboard from `admin/`:

```sh
npm run dev -- -p 3001
```

Open `http://localhost:3001`. The default API base already points to the local backend on port 3000. Public environment variables are included in the browser build; keep credentials and provider secrets on the backend.

## Checks

Run these commands from `admin/`:

```sh
node_modules/.bin/tsc --noEmit
npm run lint
npm test
npm run build
```

Install backend dependencies before `npm test`, which uses the backend's `tsx` executable. See [admin architecture](architecture.md) for feature and API boundaries.
