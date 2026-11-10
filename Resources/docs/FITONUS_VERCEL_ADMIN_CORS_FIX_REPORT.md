# FitOnus Vercel Admin → Render DEV Backend CORS Preflight Fix Report

**Report Date:** November 9, 2026  
**Frontend (Vercel Admin):** `https://fit-onus.vercel.app`  
**Backend (Render DEV API):** `https://fitonus-api-dev.onrender.com`  
**Target Route:** `OPTIONS /api/v1/admin/auth/me`  

---

## 1. Executive Summary & Root Cause Analysis

### Investigation Findings
The user observed:
```http
OPTIONS /api/v1/admin/auth/me
HTTP 405 Method Not Allowed
```
accompanied by a browser CORS failure.

### Did the 405 Originate from Render Routing, Middleware, or Express?
**The HTTP 405 originated directly from the Express backend application code**, specifically the route builder's catch-all method-not-allowed handler in [`backend/src/shared/http/route.ts`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/src/shared/http/route.ts#L99-L108).

### Mechanism of Failure:
1. **Origin Absence in Environment Configuration:**  
   The Render DEV service (`fitonus-api-dev.onrender.com`) was running with `CORS_ORIGINS` set to `http://localhost:5173`. The production/staging Vercel Admin origin (`https://fit-onus.vercel.app`) was not in the allowed set.
2. **CORS Middleware Preflight Passthrough on Non-Match:**  
   In [`backend/src/app.ts`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/src/app.ts#L13-L24), `corsMiddleware` checked `allowed.has(origin)`. When `https://fit-onus.vercel.app` was evaluated, `allowed.has(...)` returned `false`.  
   Per the behavior of the `cors` npm library, when an origin is rejected, it does not set `Access-Control-*` headers and does **not** terminate the `OPTIONS` request. Instead, it calls `next()`.
3. **Route Catch-All Throws 405:**  
   The `OPTIONS` request then proceeded down the Express middleware chain to the router. In [`backend/src/modules/admin/interface/admin.routes.ts`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/src/modules/admin/interface/admin.routes.ts#L58-L72), `/auth/me` defines only a `GET` method.  
   The catch-all handler in `buildRouter`:
   ```ts
   for (const [path, methods] of methodsByPath) {
     router.all(path, (_req, res) => {
       res.setHeader('Allow', [...methods].join(', '));
       throw new AppError(
         'method_not_allowed',
         'METHOD_NOT_ALLOWED',
         'This method is not allowed for this route.',
       );
     });
   }
   ```
   matched the unhandled `OPTIONS` request, set `Allow: GET, HEAD`, and threw `METHOD_NOT_ALLOWED`.
4. **Browser Rejection:**  
   Express formatted this as `HTTP 405 Method Not Allowed` with JSON `{ "success": false, "error": { "code": "METHOD_NOT_ALLOWED", ... } }` and **no** `Access-Control-Allow-Origin` header. The browser blocked the cross-origin request because the preflight was not HTTP 2xx and returned no CORS access headers.

---

## 2. Reproduction of Observed Error

A live curl probe to `https://fitonus-api-dev.onrender.com/api/v1/admin/auth/me` confirmed this behavior:

```bash
curl -i -X OPTIONS "https://fitonus-api-dev.onrender.com/api/v1/admin/auth/me" \
  -H "Origin: https://fit-onus.vercel.app" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization,content-type"
```

### Captured Response:
```http
HTTP/2 405 
date: Mon, 09 Nov 2026 12:41:51 GMT
content-type: application/json; charset=utf-8
allow: GET, HEAD
server: cloudflare
x-render-origin-server: Render
x-request-id: f153afea-346e-4435-aa7a-f395478b12ac
ratelimit: "300-in-15min"; r=296; t=198

{"success":false,"error":{"code":"METHOD_NOT_ALLOWED","message":"This method is not allowed for this route.","requestId":"f153afea-346e-4435-aa7a-f395478b12ac"}}
```

- **HTTP Status:** `405 Method Not Allowed`
- **Access-Control-Allow-Origin:** Missing
- **Access-Control-Allow-Methods:** Missing
- **Access-Control-Allow-Headers:** Missing
- **Server Identity:** Cloudflare edge → Render origin server → Express backend app
- **Allow Header:** `GET, HEAD` (revealing the internal Express router catch-all)

---

## 3. Implementation of the Fix

### A. Express Defense-in-Depth (`backend/src/app.ts`)
1. **Explicit Default Allowed Origins:**  
   Added `DEFAULT_ALLOWED_ORIGINS` constant containing `https://fit-onus.vercel.app`.
2. **Unified Allowed Origins Set:**  
   `corsMiddleware` now unions `config.http.corsOrigins` with `DEFAULT_ALLOWED_ORIGINS`, ensuring that the official Vercel Admin origin is always recognized even if the deployment environment variable is omitted or partially configured.
3. **Comprehensive Allowed Methods:**  
   Expanded allowed methods from `['GET', 'POST', 'PUT', 'PATCH', 'DELETE']` to include `OPTIONS` and `HEAD`:
   `['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']`.
4. **Added `Accept` to Allowed Headers:**  
   Included `'Accept'` alongside `'Authorization'`, `'Content-Type'`, `'Idempotency-Key'`, `'X-Request-Id'`, `'X-Panel-Id'` to support the browser fetch client cleanly.
5. **Preserved Security Invariants:**  
   - `credentials: true` is retained (sends and allows HttpOnly session cookies).
   - Wildcard `*` is strictly avoided with credentials.
   - Unauthorized origins receive no `Access-Control-*` headers.
   - Rate limiting and CSRF protection headers (`X-Panel-Id`) remain strictly intact.
   - Authentication and authorization middlewares (`authenticate`, `requirePermission`) are unaffected.

### B. Environment Templates
- Updated [`backend/.env.example`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/.env.example):
  `CORS_ORIGINS=http://localhost:5173,https://fit-onus.vercel.app`
- Updated [`backend/.env`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/.env):
  Appended `https://fit-onus.vercel.app` to `CORS_ORIGINS`.
- Updated [`backend/.env.primary.backup`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/.env.primary.backup):
  Appended `https://fit-onus.vercel.app` to `CORS_ORIGINS`.

---

## 4. Before & After Preflight Comparison

| Metric / Header | Before Fix | After Fix |
|---|---|---|
| **HTTP Status** | `405 Method Not Allowed` | `204 No Content` |
| **Access-Control-Allow-Origin** | _None (Browser CORS Error)_ | `https://fit-onus.vercel.app` |
| **Access-Control-Allow-Credentials** | _None_ | `true` |
| **Access-Control-Allow-Methods** | _None_ | `GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD` |
| **Access-Control-Allow-Headers** | _None_ | `Authorization, Content-Type, Accept, Idempotency-Key, X-Request-Id, X-Panel-Id` |
| **Access-Control-Max-Age** | _None_ | `600` |
| **Vary** | `Accept-Encoding` | `Origin` |
| **Response Body** | JSON `METHOD_NOT_ALLOWED` error | `0` bytes (empty body per RFC 7231) |

---

## 5. Verification & Regression Testing

A dedicated regression test suite was created in [`backend/tests/unit/admin/admin-cors-preflight.test.ts`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/tests/unit/admin/admin-cors-preflight.test.ts).

All 7 required scenarios were verified:
1. **Allowed Vercel origin:** `DEFAULT_ALLOWED_ORIGINS` contains `https://fit-onus.vercel.app`.
2. **Successful OPTIONS preflight:** Returns status `204 No Content` for preflight on `/api/v1/admin/auth/me`.
3. **Correct Access-Control-Allow-Origin:** Response carries `access-control-allow-origin: https://fit-onus.vercel.app`, `access-control-allow-credentials: true`, and `Vary: Origin`. Wildcard `*` is never used.
4. **Correct allowed methods and headers:** Methods include `GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD`; headers include `Authorization, Content-Type, Accept, Idempotency-Key, X-Request-Id, X-Panel-Id`; `max-age: 600`.
5. **Unauthorized origin not granted CORS access:** Preflight and actual requests from unauthorized origins (e.g. `https://unauthorized-attacker.example`) return no `access-control-allow-origin` header.
6. **Admin authentication still protected:**
   - Unauthenticated `GET /api/v1/admin/auth/me` from Vercel origin returns `401 Unauthorized` with `UNAUTHENTICATED`.
   - Unauthorized member `GET /api/v1/admin/auth/me` from Vercel origin returns `403 Forbidden` with `FORBIDDEN`.
   - Authenticated admin returns `200 OK` with profile payload.
7. **Existing Mobile API behavior unaffected:**
   - Requests without `Origin` header (native iOS/Android app) pass without restriction.
   - Other configured origins (`http://localhost:8081` for Expo web, `http://localhost:5173`) continue to be granted CORS access.

### Test Execution Summary:
- **Backend Unit Tests:** `77` test files passed, `747` tests passed (`0` failed)
- **Admin Unit Tests:** `7` test suites passed, `70` tests passed (`0` failed)
- **Backend TypeScript Compilation:** `tsc -p tsconfig.build.json` succeeded (`exit code 0`)
- **Admin TypeScript Compilation:** `tsc -p admin/tsconfig.json --noEmit` succeeded (`exit code 0`)

---

## 6. Required Render Environment Changes

To keep the cloud deployment configuration in sync with the codebase:

1. Log in to the **Render Dashboard** (`https://dashboard.render.com`).
2. Select the Web Service: **`fitonus-api-dev`**.
3. Go to the **Environment** tab.
4. Find the **`CORS_ORIGINS`** environment variable.
5. Update its value to:
   ```env
   http://localhost:5173,http://localhost:3000,http://localhost:3001,https://fit-onus.vercel.app
   ```
6. Click **Save Changes**.

---

## 7. Deployment & Redeployment Notice

- **Is Redeployment Required?**  
  **Yes.** Render DEV must be redeployed with the latest commit to compile and run the updated [`backend/src/app.ts`](file:///media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/backend/src/app.ts) bundle, OR saving the updated `CORS_ORIGINS` in Render's dashboard will automatically trigger an environment rebuild/restart.
- **Is Database Migration Required?**  
  **No.** No database schemas, data, or migrations were modified.
- **Is Frontend URL Modification Required?**  
  **No.** Vercel Admin API base URL (`https://fitonus-api-dev.onrender.com/api/v1/admin`) and client configuration remain completely valid and intact.
