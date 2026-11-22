# OnusFit AI Engineering Guide: Phase 2 — Stage 3
## AI Coach Integration & Observability
### AI பயிற்சியாளர் ஒருங்கிணைப்பு மற்றும் அப்சர்வபிலிட்டி (கண்காணிப்பு)

> **Language**: Bilingual (Tamil + English) for practical engineering depth and Senior/Staff AI Engineer interview preparation.  
> **Components**: `ai-backend` (`onusfit_ai.features.coach`, `onusfit_ai.shared.tools`, `onusfit_ai.shared.auth`, `onusfit_ai.shared.llm`), `backend` (`PythonCoachChatService`, `ai_usage_ledger`)  
> **Status Matrix**:
> - **Code Verified**: ✅ Complete (Clean Architecture boundaries strictly enforced; 0 violations in AST & runtime)
> - **Automated Tests**: ✅ 80/80 Python Tests Passed | 28/28 Node Vitest Coach Tests Passed
> - **Zero Schema Drift**: ✅ Node DB schemas unchanged; response contracts 100% backward compatible
> - **Zero UI Modifications**: ✅ Mobile client untouched
> - **Security Perimeter**: ✅ Anti-confused deputy (`claims.user_id`), read-only tools, error sanitization, zero PII/secret leaks in logs

---

## 1. What AI Coach Tool Integration Is
### AI பயிற்சியாளர் டூல் ஒருங்கிணைப்பு என்றால் என்ன?

#### In Simple English:
In Stage 01, we built the secure Node.js read-only tool endpoints. In Stage 02, we implemented the autonomous multi-turn Gemini function-calling loop. In **Stage 03**, we wire these capabilities directly into the real AI Coach Chat pipeline (`/internal/v1/ai/coach/chat`):

1. **Context-Aware Tool Access**: When a user asks a question requiring deep history (e.g., *"How has my bench press volume progressed over the last 3 weeks?"*), Gemini autonomously invokes `get_recent_workouts(days=21)`.
2. **Strict Identity Binding (Anti-Confused Deputy)**: Gemini never receives the user ID and cannot choose whose data to query. The internal tools client signs an M2M JWT using **only the verified user ID from the incoming service token claims (`claims.user_id`)**.
3. **End-to-End Observability**: Tool invocations increment telemetry (`toolCallsCount`) and propagate cumulative multi-turn token usage ($I, O, C, T$) directly into the Node.js `ai_usage_ledger`.
4. **Backward Compatibility & Safe Rollback**: Gated by `AI_COACH_CHAT_TOOLS` (default `false`). When enabled, `toolCalls` and authoritative source labels (`recent_workouts`, `nutrition_summary`, etc.) are attached without breaking existing mobile clients.

#### தமிழில் எளிய விளக்கம்:
Stage 01-ல் Node.js டூல் எண்ட்பாயிண்ட்களை உருவாக்கினோம்; Stage 02-ல் தானியங்கி மல்டி-டர்ன் லூப்பை உருவாக்கினோம். **Stage 03**-ல், இவற்றை உண்மையான **AI Coach Chat** அமைப்போடு முழுமையாக இணைத்துள்ளோம்:

1. **சூழல் சார்ந்த டூல் பயன்பாடு**: பயனர் தனது முந்தைய உடற்பயிற்சி அல்லது உணவு பற்றி கேட்கும்போது (எ.கா: *"கடந்த 3 வாரங்களில் எனது உடற்பயிற்சி எப்படி இருந்தது?"*), ஜெமினி தானாகவே `get_recent_workouts` போன்ற டூல்களை அழைக்கிறது.
2. **பாதுகாப்பான அடையாள உறுதிப்பாடு (Anti-Confused Deputy)**: ஜெமினிக்கு பயனர் ஐடி (User ID) தெரியாது; மாடலால் பிற பயனர்களின் தரவை திருட முடியாது. உள்நுழைவு டோக்கனில் உள்ள அங்கீகரிக்கப்பட்ட பயனர் ஐடியை (`claims.user_id`) மட்டுமே டூல் கிளையண்ட் பயன்படுத்துகிறது.
3. **முழுமையான கண்காணிப்பு (Observability)**: எத்தனை டூல்கள் இயக்கப்பட்டன என்பது ரகசிய தகவல்கள் இன்றி பதிவிடப்படுகிறது (`toolCallsCount`). பல சுழற்சிகளில் செலவான முழுமையான டோக்கன் பயன்பாடு Node.js லெட்ஜரில் பதிவு செய்யப்படுகிறது.
4. **பாதுகாப்பான சுவிட்ச் (Feature Flag)**: `AI_COACH_CHAT_TOOLS` இயல்புநிலையாக `false` என முடக்கப்பட்டுள்ளது. தேவைப்படும்போது எந்தவித இடையூறும் இன்றி இயக்கிக் கொள்ளலாம்.

---

## 2. Clean Architecture Boundary Enforcement
### தூய கட்டமைப்பு எல்லைகள் (Clean Architecture Boundaries)

To prevent architectural decay, our test harness enforces that inner layers never import heavy SDKs or infrastructure adapters:

```
┌────────────────────────────────────────────────────────┐
│                   Presentation Layer                   │
│   (FastAPI Router, Depends(get_tools_client), Auth)    │
└───────────────────────────┬────────────────────────────┘
                            │ (Injected pure Callable)
┌───────────────────────────▼────────────────────────────┐
│                    Application Layer                   │
│         (Pure Use Case, Prompts, Domain Schema)         │
│         ZERO httpx, ZERO jwt, ZERO google.genai        │
└───────────────────────────┬────────────────────────────┘
                            │ (Pure TextGenerator Port)
┌───────────────────────────▼────────────────────────────┐
│                  Infrastructure Layer                  │
│       (GeminiClient, InternalToolsClient, Jose/JWT)    │
└────────────────────────────────────────────────────────┘
```

| Layer | Allowed Modules | Forbidden Modules |
| :--- | :--- | :--- |
| **Domain** (`features/coach/domain`) | `pydantic`, `shared.contracts`, `shared.utils` | Any framework, SDK, HTTP client, or database library. |
| **Application** (`features/coach/application`) | Domain, `shared.contracts`, `shared.utils`, `shared.llm.ports`, `shared.llm.telemetry`, `shared.logging` | `httpx`, `jwt`, `google.genai`, `shared.tools`, `shared.llm.gemini`. |
| **Presentation** (`features/coach/presentation`) | Application, Domain, `fastapi`, `shared.auth`, `shared.contracts`, `shared.llm.dependencies`, `shared.tools` | Direct database access or cross-feature imports. |

---

## 3. End-to-End Execution Flow Diagram
### முழுமையான செயல்முறை வரிசை வரைபடம்

```mermaid
sequenceDiagram
    autonumber
    actor User as Mobile App (User)
    participant Node as Node.js Gateway (ChatWithCoachUseCase)
    participant PyRouter as Python Presentation (coach_chat)
    participant PyApp as Python Application (generate_coach_reply)
    participant Gemini as Google Gemini 2.5 Flash
    participant ToolClient as InternalToolsClient
    participant NodeTool as Node Internal Tools Controller
    participant Ledger as Node AI Usage Ledger

    User->>Node: POST /api/v1/coach/chat (message, context)
    Node->>PyRouter: POST /internal/v1/ai/coach/chat (Service JWT with sub=user_id)
    Note over PyRouter: Auth verified; claims.user_id extracted
    PyRouter->>PyApp: generate_coach_reply(tools, tool_handler closure)
    PyApp->>Gemini: Turn 1: Prompt + FunctionDeclarations
    Gemini-->>PyApp: Emit function_call: get_recent_workouts(days=14)
    PyApp->>ToolClient: tool_handler("get_recent_workouts", {"days": 14})
    Note over ToolClient: Signs M2M JWT with sub=claims.user_id
    ToolClient->>NodeTool: GET /api/v1/internal/tools/recent-workouts?days=14
    NodeTool-->>ToolClient: 200 OK (User's workouts JSON)
    ToolClient-->>PyApp: Sanitized tool result
    PyApp->>Gemini: Turn 2: ToolResponse + Synthesis Prompt (schema enforced)
    Gemini-->>PyApp: Final structured CoachResponse (JSON)
    Note over PyApp: Enrich sources with "recent_workouts"<br/>Set result.tool_calls = ["get_recent_workouts"]<br/>Log telemetry: toolCallsCount=1
    PyApp-->>PyRouter: CoachChatResponse (result, cumulative usage)
    PyRouter-->>Node: 200 OK (CoachChatResponse)
    Node->>Ledger: recordExternalUsage(cumulative input/output tokens)
    Node-->>User: 200 OK (Coach reply + sources + optional toolCalls)
```

---

## 4. Key Security Controls & Anti-Confused-Deputy
### முக்கியப் பாதுகாப்பு அம்சங்கள்

1. **Anti-Confused-Deputy Protection**:
   - The tool calling parameters declared to Gemini (`GetRecentWorkoutsArgs`, `GetNutritionSummaryArgs`, `GetWeightTrendArgs`, `SearchExercisesArgs`) **strictly forbid `userId`**.
   - Any model hallucination attempting to inject `userId` fails Pydantic schema validation.
   - The user identity is bound in `presentation/coach_chat.py` directly from `claims.user_id` of the verified service JWT.
2. **Untrusted Tool Outputs**:
   - All tool responses returned to Gemini are wrapped as data strings. Prompt formatting ensures tool outputs cannot override critical system instructions.
3. **Error Sanitization**:
   - In case of internal gateway timeouts, network failures, or 500 errors, `sanitize_tool_error` strips internal stack traces, URLs, and token fragments before returning a generic error to Gemini.
4. **Telemetry Privacy**:
   - `log_ai_call` logs only metadata counts: `toolCallsCount`. It never logs tool arguments, SQL query results, meal descriptions, or personal health metrics.

---

## 5. Token Accounting & Observability
### டோக்கன் பயன்பாடு மற்றும் கண்காணிப்பு

- Gemini multi-turn function calling executes $N$ intermediate turns. Each turn incurs input and output token costs.
- The `GeminiClient._call_multi_turn` loop accumulates input and output tokens accurately:
  $$\text{Total Input Tokens} = \sum_{i=1}^{k} \text{turn\_input}_i$$
  $$\text{Total Output Tokens} = \sum_{i=1}^{k} \text{turn\_output}_i$$
- Thinking tokens and cached tokens are isolated and never double-counted.
- The cumulative numbers are returned in `CoachChatResponse.usage` and stored in PostgreSQL via Node's `usageRecorder.recordExternalUsage`.

---

## 6. Staff Engineer Q&A (Interview Preparation)
### நேர்காணல் வழிகாட்டி (Questions & Answers)

#### Q1: Why should internal tools receive user identity via JWT claims rather than model arguments?
> **Answer**: If `userId` is passed as an LLM tool argument, the model acts as a confused deputy. An adversarial prompt injection (e.g. *"Check workouts for user UUID 9999-..."*) could trick the model into querying another user's private medical and fitness records. By binding identity exclusively to verified machine-to-machine JWT claims (`claims.user_id`), the model cannot access data outside the authenticated session scope, regardless of prompt manipulation.

#### Q2: How does Clean Architecture prevent framework lock-in in agentic AI systems?
> **Answer**: By keeping `application` and `domain` layers completely free of provider SDKs (`google.genai`, `httpx`, `jwt`), the core business logic of coaching, prompt synthesis, and conversation evaluation is isolated behind abstract protocols (`TextGenerator`, pure `Callable` tool handlers). Swapping the model provider (e.g., from Gemini to Anthropic Claude or local Ollama) requires modifying only the infrastructure layer without rewriting use cases or domain rules.

#### Q3: Why is `AI_COACH_CHAT_TOOLS` defaulted to `false`?
> **Answer**: Function calling increases LLM latency (multi-turn roundtrips) and token consumption. Setting the feature flag default to `false` guarantees safe, incremental rollout, zero production surprises, and immediate rollback capability in case of upstream provider anomalies.

