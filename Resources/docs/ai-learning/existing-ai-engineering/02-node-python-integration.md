# TOPIC 02: Node.js ↔ Python AI Service Integration — KT & Interview Master Guide

> **Modules:**  
> - Node.js: `backend/src/shared/ai/python-ai-client.ts`, `backend/src/shared/ai/python-ai-call.ts`  
> - Python: `ai-backend/src/onusfit_ai/shared/auth/auth.py`  
> **Learning Status:** COMPLETED  
> **Category:** Cross-Runtime Distributed System Integration & Security

---

## 1. Executive Summary & Architecture Overview

The Node.js (TypeScript) backend communicates with the Python (FastAPI) AI backend exclusively via secure **Service-to-Service HTTP POST calls**. The Python service is private and never accessible to the public internet or mobile clients.

### Key Architecture Decisions:
1. **Cryptographic Identity via JWT Claims:** User ID never travels in the JSON request body. Identity is encapsulated strictly in the signed JWT `sub` claim (`sub: request.userId`), preventing identity spoofing.
2. **Replay Attack Defense:** Every service token has a 30-second TTL and a unique `jti` (JWT ID). Python's thread-safe `ReplayCache` stores and rejects re-used JTIs.
3. **Privilege Scoping:** Tokens specify a granular `scope` (e.g. `ai:coach:chat`, `ai:meals:photo`, `ai:speech:transcribe`). Python presentation routers reject tokens with mismatched scopes.
4. **Billing & Quota Classification (`dispatched` flag):** Node.js distinguishes whether a failure occurred before sending (safe to refund user quota) or after dispatching to the provider (quota consumed).

---

## 2. Code Reference & Implementation Details

### Node.js: `backend/src/shared/ai/python-ai-client.ts`

```typescript
export class PythonAiClient {
  async postJson(request: PythonAiRequest): Promise<unknown> {
    // 1. Mint short-lived Service JWT
    const token = await new SignJWT({ scope: request.scope, rid: request.requestId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('onusfit-node-api')
      .setAudience('onusfit-ai-backend')
      .setSubject(request.userId)      // Identity travels strictly in the token!
      .setIssuedAt()
      .setExpirationTime('30s')        // Short 30-second window
      .setJti(randomUUID())            // Unique token id to prevent replay attacks
      .sign(this.secretKey);

    // 2. Transmit HTTP request with tracing and hard deadline
    const response = await this.fetchImpl(`${this.baseUrl}${request.path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        'x-request-id': request.requestId,
        ...(isSafeCorrelationId(request.correlationId) ? { 'x-correlation-id': request.correlationId } : {}),
      },
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(request.timeoutMs),
    });
    // ...
  }
}
```

### Python: `ai-backend/src/onusfit_ai/shared/auth/auth.py`

```python
class ReplayCache:
    """Remembers token ids until they expire, preventing token reuse across worker threads."""
    def __init__(self) -> None:
        self._seen: dict[str, float] = {}
        self._lock = threading.Lock()

    def check_and_store(self, jti: str, expires_at: float, now: float | None = None) -> bool:
        now = time.time() if now is None else now
        with self._lock:
            self._seen = {k: exp for k, exp in self._seen.items() if exp > now}
            if jti in self._seen:
                return False  # REPLAY DETECTED!
            self._seen[jti] = expires_at
            return True
```

---

## 3. Communication & Security Flow

```text
Node.js Backend                                           Python FastAPI Backend
┌─────────────────────────────────┐                       ┌───────────────────────────────────┐
│ Use Case (e.g. ChatWithCoach)   │                       │ FastAPI Presentation Route        │
│               │                 │                       │ (POST /internal/v1/ai/coach/chat) │
│               ▼                 │                       └─────────────────┬─────────────────┘
│ PythonCoachChatService          │                                         ▲
│               │                 │                                         │
│               ▼                 │                         HTTP POST with: │
│ PythonAiClient.postJson()       │                                         │
│ 1. Sign JWT (exp: 30s, HS256)   ├─────────────────────────────────────────┤
│    - sub: userId                │ Headers:                                │
│    - scope: "ai:coach:chat"     │ Authorization: Bearer <Token>           │
│    - jti: <UUID>                │ X-Request-Id: <ID>                      │
│ 2. AbortSignal.timeout(15000ms) │ X-Correlation-Id: <ID>                  │
└─────────────────────────────────┘ Body: JSON (context, history, message)  │
                                                                            ▼
                                                          ┌───────────────────────────────────┐
                                                          │ shared/auth/auth.py               │
                                                          │ 1. Verify HS256 Secret (>= 32 ch) │
                                                          │ 2. Verify iss, aud, exp (<= 60s)  │
                                                          │ 3. Check scope == "ai:coach:chat" │
                                                          │ 4. ReplayCache: has JTI been seen?│
                                                          └─────────────────┬─────────────────┘
                                                                            │ Token Valid
                                                                            ▼
                                                          ┌───────────────────────────────────┐
                                                          │ Pydantic Validation & Gemini Call │
                                                          └───────────────────────────────────┘
```

---

## 4. Error Classification & Quota Decision

| Error Kind | Cause | `dispatched` | Quota Refund Action |
|:---|:---|:---|:---|
| `unreachable` | TCP connection refused (`ECONNREFUSED`), Python service down | `false` | **Refunded** (Request never reached provider) |
| `auth` | Token invalid, secret mismatch, expired token | `false` | **Refunded** |
| `invalid_request`| Pydantic schema validation failure (HTTP 422) | `false` | **Refunded** |
| `timeout` | Node.js hard deadline expired during execution | `true` | **Consumed** (Gemini may still be processing) |
| `provider_error` | Gemini API returned 5xx / rate limit | `true` | **Consumed** |

---

## 5. 15 Technical Interview Questions & Answers

### A. Beginner Level
1. **Q: Why should internal microservices authenticate each other instead of trusting the internal network?**
   *A:* Zero Trust Architecture. An attacker or misconfigured container in the same VPC cannot invoke privileged internal AI endpoints without a cryptographic service token.
2. **Q: Why does the user ID travel only inside the JWT token rather than the request body?**
   *A:* To prevent user impersonation. If it were in the body, a compromised service or caller could manipulate the `userId` field. The JWT cryptographically guarantees the user ID was verified by Node.js.
3. **Q: What is the TTL (time-to-live) of OnusFit's service token?**
   *A:* 30 seconds (`TOKEN_TTL = '30s'`).
4. **Q: What algorithm is used to sign the service token?**
   *A:* Symmetric HS256 using a shared secret of at least 32 characters.
5. **Q: What header propagates correlation across Node.js and Python?**
   *A:* `X-Correlation-Id`.

### B. Intermediate Level
6. **Q: What is a Replay Attack, and how does `ReplayCache` prevent it?**
   *A:* A replay attack occurs when an eavesdropper captures a valid token and re-sends it. `ReplayCache` tracks the token's unique `jti` (JWT ID); if a token with the same `jti` is seen again before expiration, it is rejected.
7. **Q: What does the `dispatched: boolean` flag in `PythonAiError` represent?**
   *A:* It indicates whether the request may have already reached the external AI provider (Gemini). It dictates whether user quota should be refunded or consumed upon error.
8. **Q: How does `AbortSignal.timeout(timeoutMs)` guard the Node.js event loop?**
   *A:* It sets an OS-level timer that cancels the fetch promise if the AI backend does not respond within the allocated deadline, preventing hung sockets.
9. **Q: Why does Python verify `scope` against the endpoint path?**
   *A:* Privilege separation. A token minted for speech transcription (`ai:speech:transcribe`) cannot be used to call Coach chat (`ai:coach:chat`).
10. **Q: What HTTP status codes trigger `invalid_request` in `errorFromResponse`?**
    *A:* HTTP 422 (Unprocessable Entity) and HTTP 413 (Payload Too Large).

### C. Advanced Level
11. **Q: Why does `ReplayCache` use `threading.Lock` in an async FastAPI application?**
    *A:* FastAPI executes synchronous dependency functions (`Depends(require_scope)`) inside an `anyio` worker thread pool. `threading.Lock` prevents race conditions where two simultaneous threads attempt to claim the same `jti`.
12. **Q: What happens if `AI_SERVICE_JWT_SECRET` is shorter than 32 characters?**
    *A:* Node.js throws an `AppError` at client construction time, and Python fails startup checks with a critical error, adhering to cryptographic security standards.
13. **Q: How does Node.js distinguish between a network failure before sending vs during transmission?**
    *A:* By inspecting the low-level error code (`ECONNREFUSED`, `ENOTFOUND`, `EHOSTUNREACH`). If present in `NOT_SENT_CODES`, `dispatched` is set to `false`.
14. **Q: Why is `_CLOCK_SKEW_SECONDS` set to 5 seconds in Python auth?**
    *A:* To accommodate minor clock drift across distributed container hosts when evaluating `iat` and `nbf` claims.
15. **Q: What is the fallback strategy if Python returns a 5xx or network timeout?**
    *A:* If `fallbackEligible` is true, Node.js use-case layer can catch `PythonAiError` and fall back to either deterministic business logic or fallback providers without crashing the user request.

