# OnusFit AI Engineering Guide: Phase 2 — Stage 1
## Gemini Function Calling (Tools) — Secure Internal Tool API & Tool Specification
### ஜெமினி ஃபங்க்ஷன் காலிங் (கருவிகள்) — பாதுகாப்பான இன்டர்னல் டூல் API மற்றும் டூல் விவரக்குறிப்பு

> **Language**: Bilingual (Tamil + English) for practical engineering depth and Senior/Mid-Level AI Engineer interview preparation.  
> **Components**: `backend` (`/api/v1/internal/tools/*`), `ai-backend` (`onusfit_ai.features.coach.application.tools`)  
> **Status Matrix**:
> - **Code Verified**: ✅ Complete (Clean/Hexagonal Architecture aligned across Node.js & Python)
> - **Automated Tests**: ✅ 14 Vitest Tests Passed (0.58s) | 12 Pytest Tests Passed (0.20s)
> - **Zero Schema Drift**: ✅ Existing database schema and external client contracts 100% preserved
> - **Zero UI Modifications**: ✅ Mobile client untouched
> - **Security Perimeter**: ✅ Zero SQL execution, anti-confused-deputy token authorization, bounded queries, replay cache

---

## 1. What Gemini Function Calling (Tool Calling) Is
### ஜெமினி ஃபங்க்ஷன் காலிங் (டூல் காலிங்) என்றால் என்ன?

#### In Simple English:
In traditional generative AI systems, developers try to predict everything the user might ask and "stuff" all possible data into the initial prompt context (e.g., past workouts, nutrition logs, personal records, weight history). This approach has severe drawbacks:
1. **Context Window Waste & Cost**: You waste thousands of tokens sending irrelevant data on every single turn.
2. **Stale Information**: The model cannot fetch real-time or dynamically filtered data.
3. **Prompt Injection & Confusion**: The model mixes up context data with user instructions.

**Gemini Function Calling (Tool Calling)** is a native protocol where:
1. The developer declares a suite of typed tools (`types.Tool` with `FunctionDeclaration` and OpenAPI JSON Schema parameter definitions).
2. The model reasons over the user inquiry and, instead of generating conversational prose, emits a structured **function call request** (`name` and validated `args`).
3. The server executes the function against authoritative, secured backend services and returns the structured **function response**.
4. The model incorporates the real data into its final grounded response.

#### தமிழில் எளிய விளக்கம்:
வழக்கமான Chatbot கட்டமைப்புகளில், பயனர் கேட்கும் அனைத்து கேள்விகளுக்கும் பதிலளிக்க தேவையான அனைத்து தகவல்களையும் (கடந்த கால உடற்பயிற்சிகள், உணவு விவரங்கள், எடை பதிவுகள்) ஒரே நேரத்தில் பிராம்ப்ட்டில் (Prompt Context Stuffing) திணிப்பார்கள். இதனால்:
1. தேவையில்லாமல் அதிக டோக்கன்கள் செலவாகி கட்டணம் அதிகரிக்கும்.
2. மாடலுக்கு எந்த தகவல் எப்போது தேவை என்பதை தீர்மானிக்க முடியாது.
3. தகவல்களை மாடல் தவறாக புரிந்துகொள்ளும் அபாயம் உள்ளது.

**Gemini Function Calling** என்பது, மாடலிடம் நாம் சில **அங்கீகரிக்கப்பட்ட கருவிகளை (Tools)** கொடுத்துவிடுவோம். பயனர் ஒரு குறிப்பிட்ட விவரத்தை கேட்கும்போது (எ.கா: *"நான் கடந்த வாரம் எவ்வளவு வெயிட் தூக்கினேன்?"*), மாடலே நேரடியாக `get_recent_workouts(days=7)` என்ற கருவியை இயக்கச் சொல்லி கோரிக்கை அனுப்பும். நமது பேக்கெண்ட் அந்த கருவியை பாதுகாப்பாக இயக்கி உண்மையான தகவலை தரும்; அதை வைத்து மாடல் துல்லியமான பதிலை பயனருக்கு அளிக்கும்.

---

## 2. Phase 2 Roadmap & Stage Breakdown
### இரண்டாம் கட்ட நிலைகள் (Phase 2 Stages)

| Stage | Name | Focus & Boundaries | Status |
| :--- | :--- | :--- | :--- |
| **Stage 01** | **Tool Specifications & Internal Node.js API** | Machine-to-machine service JWT auth, anti-confused-deputy user authorization, Zod/Pydantic validation, bounded domain repository access, Python ToolDispatcher | **COMPLETED (Current)** |
| **Stage 02** | **Multi-Turn Gemini Tool Execution Loop** | Native `types.Tool` declarations, model-to-tool-to-model execution loop in Python, round budgets, timeout & fallback handling | *Upcoming (Stage 02)* |
| **Stage 03** | **Coach Chat Integration & Telemetry** | Wire tool results to mobile blocks (`toolCalls`, `sources`), trace spans, usage ledger accounting | *Upcoming (Stage 03)* |

---

## 3. Verified Architecture & Component Ownership
### கணினி கட்டமைப்பு மற்றும் கூறுகளின் பொறுப்பு (Ownership Matrix)

```text
 ┌────────────────────────────────────────────────────────┐
 │           Mobile App (React Native Expo)               │
 └──────────────────────────┬─────────────────────────────┘
                            │ HTTPS (Bearer User JWT)
                            ▼
 ┌────────────────────────────────────────────────────────┐
 │            Node.js API Gateway (Express 5 + TS)        │
 │  - Authentication & Atomic Quota Gating                │
 │  - Mints Short-Lived Service JWT (HS256)               │
 └──────────────────────────┬─────────────────────────────┘
                            │ HTTP POST (Service JWT + Prompt)
                            ▼
 ┌────────────────────────────────────────────────────────┐
 │          Python AI Microservice (FastAPI)              │
 │  - Coach Agent Reasons & Decides Tool Execution        │
 │  - Emits Tool Call: e.g. get_recent_workouts(days=7)   │
 │  - Validates args via Pydantic (GetRecentWorkoutsArgs) │
 │  - Mints Machine-to-Machine JWT (scope: ai:tools:read) │
 └──────────────────────────┬─────────────────────────────┘
                            │ HTTP POST (Internal Tool RPC)
                            ▼
 ┌────────────────────────────────────────────────────────┐
 │    Node.js Internal Tools API (/api/v1/internal/tools) │
 │  - Middleware: Verifies HS256 Service Token & Scope    │
 │  - Replay Prevention via In-Memory ToolReplayCache     │
 │  - User-Scoped Authorization: Actor = payload.sub      │
 │  - Zod Request Schema Validation                       │
 │  - Domain Repositories (PostgreSQL Parameterized SQL)   │
 │  - Returns Bounded Domain Data                         │
 └────────────────────────────────────────────────────────┘
```

| Architecture Responsibility | Owner Component | Actual File Path | Function / Class |
| :--- | :--- | :--- | :--- |
| **Tool Parameter Schema** | Python AI Backend | `ai-backend/.../coach/application/tools.py` | `GetRecentWorkoutsArgs`, `GetNutritionSummaryArgs`, etc. |
| **Gemini Tool Declarations** | Python AI Backend | `ai-backend/.../coach/application/tools.py` | `get_coach_tool_declarations()`, `get_coach_tools()` |
| **Tool Dispatcher & Token Mint**| Python AI Backend | `ai-backend/.../coach/application/tools.py` | `InternalToolsClient`, `mint_internal_tool_token()` |
| **Machine Auth & Replay Defense**| Node.js Gateway | `backend/.../coach/interface/internal-tools.routes.ts` | `createInternalServiceAuth()`, `ToolReplayCache` |
| **Tool Input/Output Schemas** | Node.js Gateway | `backend/.../coach/interface/internal-tools.schemas.ts`| `getRecentWorkoutsInputSchema`, etc. |
| **Tool Business Logic** | Node.js Gateway | `backend/.../coach/interface/internal-tools.controller.ts`| `createInternalToolsController()` |
| **Domain Data Repositories** | Node.js Domain | `backend/src/modules/{workouts,nutrition,progress}/` | `PgWorkoutSessionRepository`, `PgMealRepository`, etc. |
| **Container Composition Root** | Node.js Gateway | `backend/src/container.ts` | `createCoachModule()` with internal tools wiring |

---

## 4. Deep-Dive Security Architecture (பாதுகாப்பு கட்டமைப்பு)

### 4.1 Anti-Confused-Deputy Attack Prevention
**The Threat**: In an agentic architecture, an LLM might hallucinate or be tricked by a malicious user prompt (e.g. *"Look up user 999's weight"*). If the tool accepts `userId` as an argument from the LLM, the model becomes a confused deputy, leaking private health data of other users.

**Our Architectural Defense**:
1. Tool argument schemas **strictly forbid** any `userId` or `targetUserId` parameters (`model_config = ConfigDict(extra="forbid")`).
2. The Node.js internal endpoints **completely ignore** any client/model-supplied identifiers.
3. The authenticated user context is derived **exclusively** from the cryptographic `sub` claim of the verified HS256 Service JWT, which was signed at the start of the user's session.
4. Cross-user access is mathematically impossible at the protocol level.

### 4.2 Arbitrary SQL Injection Immunity
**The Threat**: Naive AI implementations allow LLMs to generate or execute raw SQL queries (`SELECT * FROM users...`), creating catastrophic vulnerabilities.

**Our Architectural Defense**:
1. Zero SQL interfaces are exposed to the AI engine or internal tool endpoints.
2. All data retrieval delegates to strictly typed domain repositories (`PgWorkoutSessionRepository`, `PgMealRepository`, `PgWeightRepository`, `PgExerciseRepository`).
3. All database queries use parameterized SQL placeholders (`$1, $2, ...`) via the PostgreSQL driver (`pg`).

### 4.3 Replay Attack Prevention (`ToolReplayCache`)
Every machine-to-machine tool token contains a cryptographically random UUID (`jti`) and a strict 30-second expiration (`exp`).
The Node.js gateway records used `jti` values in `ToolReplayCache`. If an intercepted token is presented a second time, it is immediately rejected with HTTP 401 `INVALID_TOKEN`.

### 4.4 Bounded Query Responses (Context Overflow Protection)
Unbounded queries can crash services or overflow the LLM's context window.
All four tools enforce hard limits at both schema and repository layers:
- `get_recent_workouts`: clamped to max 10 completed workouts and top 10 personal records.
- `get_nutrition_summary`: clamped to a maximum of 30 days.
- `get_weight_trend`: clamped to max 30 weight log points.
- `search_exercises`: clamped to max 10 exercise items.

---

## 5. The 4 Production Tool Contracts

### 1. `get_recent_workouts`
- **Purpose**: Fetch recent completed workouts, volume lifted, calories burned, and personal records.
- **Python Schema**: `GetRecentWorkoutsArgs(days: int = 7)` (1 <= days <= 90)
- **Node Endpoint**: `POST /api/v1/internal/tools/recent-workouts`

### 2. `get_nutrition_summary`
- **Purpose**: Fetch daily calories, macronutrient breakdown (protein, carbs, fat), water intake, and daily targets.
- **Python Schema**: `GetNutritionSummaryArgs(date: str | None, days: int = 7)` (1 <= days <= 30)
- **Node Endpoint**: `POST /api/v1/internal/tools/nutrition-summary`

### 3. `get_weight_trend`
- **Purpose**: Fetch current weight, starting weight, target weight, and weight log history.
- **Python Schema**: `GetWeightTrendArgs(days: int = 30)` (1 <= days <= 90)
- **Node Endpoint**: `POST /api/v1/internal/tools/weight-trend`

### 4. `search_exercises`
- **Purpose**: Search the verified exercise catalog by name, muscle group, or equipment.
- **Python Schema**: `SearchExercisesArgs(query: str, muscle: str | None, equipment: str | None, limit: int = 5)` (1 <= limit <= 10)
- **Node Endpoint**: `POST /api/v1/internal/tools/search-exercises`

---

## 6. Verification & Automated Test Evidence

### Complete Verification Summary

| Test Suite | File | Tests | Result | Execution Time |
| :--- | :--- | :--- | :--- | :--- |
| **Node Internal Tools Auth** | `backend/tests/unit/coach/internal-tools-auth.test.ts` | 9 | ✅ **100% Passed** | 27ms |
| **Node Internal Tools Controller**| `backend/tests/unit/coach/internal-tools-controller.test.ts` | 5 | ✅ **100% Passed** | 20ms |
| **Python Coach Tools & Dispatcher**| `ai-backend/tests/test_coach_tools.py` | 12 | ✅ **100% Passed** | 0.20s |
| **Backend TypeScript Compiler** | `tsc --noEmit` | Full Project | ✅ **0 Errors** | 4.8s |
| **Backend Code Linter** | ESLint (`eslint`) | Modified Files | ✅ **0 Warnings/Errors** | Clean |
| **Python Code Linter** | Ruff (`ruff check`) | Modified Files | ✅ **0 Warnings/Errors** | Clean |

---

## 7. Interview Talking Points (நேர்காணல் வழிகாட்டி)

### Q: "How did you design tool calling securely in a distributed system?"
**Answer**:  
*"In OnusFit, we decoupled tool definitions and tool execution following Clean Hexagonal Architecture. The Python AI microservice defines Gemini `FunctionDeclaration` objects using strict Pydantic v2 schemas. When the model requests a tool, our `InternalToolsClient` mints a short-lived, signed HS256 service JWT with a 30-second TTL and user subject claim (`sub`). The Node.js API Gateway receives this at `/api/v1/internal/tools/*`, verifies the token, scope (`ai:tools:read`), and checks a replay cache (`ToolReplayCache`). Crucially, we prevent Confused Deputy attacks by extracting the user ID strictly from the cryptographic token `sub`, never from the model-supplied tool arguments. All database access delegates to verified domain repository ports using parameterized SQL, preventing arbitrary SQL execution entirely."*

### Q: "What prevents the model from blowing up your token budget with large database queries?"
**Answer**:  
*"Every internal tool endpoint enforces strict pagination and result bounding at the database query level. For example, `get_recent_workouts` limits results to the latest 10 sessions and 10 personal records, `get_nutrition_summary` caps queries at 30 days, and `search_exercises` clamps catalog matches to 10 items. This bounds the tool result payload to under 500 tokens, guaranteeing predictability in downstream model reasoning."*
