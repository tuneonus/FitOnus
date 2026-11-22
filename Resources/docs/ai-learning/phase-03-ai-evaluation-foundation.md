# OnusFit AI Engineering Guide: Phase 03
## AI Evaluation Foundation — Architecture, Golden Datasets & Offline Quality Gates
### செயற்கை நுண்ணறிவு மதிப்பீட்டு அடித்தளம் — கட்டமைப்பு, பெஞ்ச்மார்க் தரவுத்தொகுப்புகள் மற்றும் CI தரக்கட்டுப்பாடுகள்

> **Language**: Bilingual (Tamil + English) for practical engineering depth and AI Engineer interview preparation.  
> **Components**: `ai-backend/tests/evals/` (Offline Suite, Evaluator Engine, Golden Datasets, CLI Runner, Markdown Reporter), `.github/workflows/ai-backend.yml`  
> **Status Matrix**:
> - **Code Verified**: ✅ Complete (Deterministic offline suite, 6 metric evaluators, CLI runner, CI gate)
> - **Automated Tests**: ✅ 54 Pytest Tests Passed (0.32s) | 66 Golden Benchmark Cases Validated (100%)
> - **Zero Schema Drift**: ✅ Pydantic v2 schemas and domain limits 100% preserved
> - **Zero UI Modifications**: ✅ Mobile client untouched
> - **Security Perimeter**: ✅ Zero external network access in CI, Anti-confused-deputy isolation, Error credential sanitization

---

## 1. What AI Evaluation Is
### செயற்கை நுண்ணறிவு மதிப்பீடு (AI Evaluation) என்றால் என்ன?

#### In Simple English:
In traditional software, functions are deterministic: given the same input, `add(2, 3)` will always equal `5`. In Generative AI systems, Foundation LLMs are autoregressive probability engines: slight model updates, temperature fluctuations, or prompt modifications can subtly degrade output formats, hallucinate facts, or bypass safety rules.

**AI Evaluation** is the systematic, quantitative discipline of benchmarking LLM behavior against predefined ground-truth datasets, domain tolerance bands, and deterministic contract gates.

#### தமிழில் எளிய விளக்கம்:
வழக்கமான மென்பொருள்களில் ஒரு ஃபங்ஷனுக்கு ஒரே உள்ளீட்டைக் கொடுத்தால் (`add(2, 3)`), அது எப்போதும் `5` என்றே விடையளிக்கும். ஆனால் Generative AI மாடல்களில், நாம் சிறு மாற்றங்களை பிராம்ப்ட்டில் செய்தாலும், மாடல் தவறான தகவல்களை (Hallucination) உருவாக்கலாம் அல்லது வடிவமைப்பு விதியை (JSON Schema) உடைக்கலாம்.

**AI Evaluation** என்பது, நமது AI மாடல் மற்றும் பேக்கெண்ட் உண்மையான தகவல்களை துல்லியமாகத் தருகிறதா, விதிகளை மீறாமல் இருக்கிறதா என்பதை முன்னரே தயாரிக்கப்பட்ட **பெஞ்ச்மார்க் தரவுகளை (Golden Datasets)** கொண்டு தானியக்கமாக அளவிடும் அறிவியல் முறையாகும்.

---

## 2. Why LLM Testing Differs from Traditional Unit Testing
### LLM சோதனையானது வழக்கமான Unit Testing-லிருந்து எவ்வாறு வேறுபடுகிறது?

| Dimension | Traditional Unit Testing | AI Evaluation Engineering |
| :--- | :--- | :--- |
| **Output Predictability** | Deterministic (Exact match: `assert x == 5`) | Probabilistic / Semantic (Tolerance ranges, schema compliance, intent accuracy) |
| **Failure Modes** | Syntax errors, unhandled exceptions, null pointer bugs | Tone degradation, hallucinations, prompt injection, tool mis-selection, boundary breaches |
| **Execution Cost** | Negligible (\$0.00, microseconds per test) | Potential API billing tokens and provider latency if calling live models |
| **Evaluation Strategy** | Single boolean assertions | Multi-tier: Fast deterministic offline regression tests + empirical live benchmarks |

---

## 3. Two-Tier Evaluation Architecture
### இரு அடுக்கு மதிப்பீட்டுக் கட்டமைப்பு (Two-Tier Evaluation Architecture)

```text
 ┌────────────────────────────────────────────────────────────────────────┐
 │           Tier 1: Offline Deterministic Test Suite (CI Default)        │
 │  - Runs automatically on every pull request ($0.00 Token Cost)          │
 │  - Evaluates 66 golden benchmark cases using 6 Stage 03 evaluators      │
 │  - Verifies Pydantic v2 schema compliance across all 5 features         │
 │  - Anti-Confused-Deputy authorization (forbids userId in arguments)    │
 │  - Error sanitization (scrubs JWTs, internal IPs, DB stack traces)      │
 │  - Baseline regex safety checks & prompt injection boundary flattening │
 └───────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │        Tier 2: Empirical Live Benchmark Harness (Opt-in CLI Runner)     │
 │  - Triggered manually via CLI: python tests/evals/runner.py --live     │
 │  - Requires explicit GEMINI_API_KEY authorization                       │
 │  - Injects TextGenerator (or GeminiClient) to generate live outputs     │
 │  - Evaluates live responses using the exact same Stage 03 evaluators   │
 │  - Measures latency, token consumption, and model fallback parity      │
 │  - Outputs: LIVE BASELINE: NOT MEASURED when unconfigured              │
 └────────────────────────────────────────────────────────────────────────┘
```

---

## 4. The 6 Curated Golden Benchmark Datasets
### 6 பெஞ்ச்மார்க் தரவுத்தொகுப்புகள் (Golden Benchmark Datasets)

Total of **66 benchmark cases** stored under `ai-backend/tests/evals/datasets/`:

| Dataset File | Cases | Category Focus | Ground-Truth Source / Provenance |
| :--- | :--- | :--- | :--- |
| **`coach_chat_benchmark.json`** | 12 | Plateau breaking, recovery fatigue, nutrition advice, persona limits | ACSM 11th Ed., NSCA Essentials, ISSN Position Stands |
| **`nutrition_benchmark.json`** | 16 | Idli, Dosa, Sambar, Chutney, Chapati, Dal, Curd Rice, Boiled Eggs | **IFCT 2017** (Indian Food Composition Tables, ICMR-NIN), USDA FoodData Central |
| **`function_calling_benchmark.json`** | 10 | Workouts history, nutrition targets, weight trend, catalog search, negative cases | OnusFit Coach Tools Specification v1 |
| **`multilingual_speech_benchmark.json`**| 12 | Tamil script (`தமிழ்`), Tanglish transliteration, spelling variants (`dosai`/`thosai`) | Curated Tamil/Tanglish speech corpus |
| **`safety_benchmark.json`** | 10 | Crushing chest pain, rotator cuff tears, extreme starvation ($< 1000$ kcal), PEDs, jailbreaks | AHA/ACSM Triage, NEDA, WADA, OWASP Top 10 for LLMs |
| **`coach_insights_benchmark.json`** | 6 | Consistency, low hydration warning, overtraining alert, rest day celebration | OnusFit Coach Insights Heuristics Specification |

---

## 5. Reusable Deterministic Evaluators
### மறுபயன்பாட்டு மதிப்பீட்டு கருவிகள் (Evaluator Metrics Engine)

### 5.1 Schema Conformance Evaluator (`evaluators/schema.py`)
Validates that LLM responses parse into strict Pydantic models (`GeminiCoachReplyOutput`, `GeminiVoiceMealOutput`, `GeminiPhotoMealOutput`, etc.) with zero missing required fields or type errors.

### 5.2 Tool Selection Evaluator (`evaluators/tools.py`)
Computes Tool Selection Precision, Recall, and Argument Accuracy:
- Asserts that tools are triggered only when intent requires fitness records.
- Verifies model arguments: e.g. `days` within $[1, 90]$, `date` matching `YYYY-MM-DD`.
- **Security Check:** Fails immediately if the model generates any forbidden user identifier (`userId`, `targetUserId`).

### 5.3 Nutrition Tolerance Evaluator (`evaluators/nutrition.py`)
Evaluates estimated foods against verified laboratory reference values using physiological tolerance bands:
$$\text{Relative Error} = \frac{|\text{Estimated} - \text{Reference}|}{\text{Reference}}$$
- **Calories**: $\pm 10\%$
- **Macronutrients (Protein, Carbs, Fat)**: $\pm 15\%$
- **Serving Weight**: $\pm 20\%$

### 5.4 Factual Grounding Evaluator (`evaluators/grounding.py`)
Extracts quantitative claims from the AI Coach's response (e.g. `80kg`, `140g protein`, `4200kg volume`) and verifies that each personal metric exists in the user's injected fitness context, preventing fictional progress assertions.

### 5.5 Multilingual Dialect Evaluator (`evaluators/multilingual.py`)
- Normalizes Tanglish colloquialisms (`dosai` $\to$ `dosa`, `oru` $\to$ 1, `rendu` $\to$ 2).
- Verifies Unicode Tamil script preservation (`[\u0B80-\u0BFF]`).
- Checks language detection accuracy between `ta`, `tanglish`, and `en`.

### 5.6 Baseline Safety Evaluator (`evaluators/safety.py`)
- Verifies mandatory clinical disclaimer presence on medical red flags (`chest pain`, `rotator cuff`, `dizziness`).
- Refuses extreme caloric deficits ($< 1000\text{ kcal}$) and anabolic steroid guidance.

---

## 6. Execution & Verification Commands

### Run Offline Evaluation Tests (Pytest)
```bash
cd ai-backend
.venv/bin/pytest tests/evals -v
```
*Result: 54 passed in 0.32s.*

### Run Evaluation CLI Runner (Generates JSON + Markdown Reports)
```bash
cd ai-backend
.venv/bin/python tests/evals/runner.py --output-json tests/evals/results/report.json --output-md tests/evals/results/report.md
```
*Result: 66/66 benchmark cases evaluated in OFFLINE mode with 100% pass rate.*

---

## 7. Interview Talking Points (நேர்காணல் வழிகாட்டி)

### Q: "How did you design an AI Evaluation pipeline without ballooning CI costs?"
**Answer**:  
*"We implemented a strict Two-Tier Evaluation Architecture in OnusFit. Tier 1 is our offline deterministic regression suite that runs on every pull request in GitHub Actions. It validates Pydantic JSON Schema conformance, domain boundary clamping, anti-confused-deputy token authorization, and baseline safety keywords in under 0.5 seconds at \$0.00 token cost. Tier 2 is an opt-in live benchmark runner that evaluates empirical model reasoning, tool selection accuracy, and nutrition tolerance against live Gemini endpoints only when explicitly invoked via `--live` with authorized credentials. This prevents flaky CI runs and eliminates accidental API billing."*

### Q: "How do you evaluate nutritional accuracy when generative models estimate macros?"
**Answer**:  
*"We reject brittle exact-match comparisons because biological food variation naturally causes slight differences in macro density. Instead, we built a tolerance-based evaluator grounded in verified laboratory data from IFCT 2017 (Indian Food Composition Tables) and USDA FoodData Central. For core South Indian foods like Idli, Dosa, and Sambar, we evaluate whether estimates fall within physiologically sound tolerance bands: $\pm 10\%$ for calories, $\pm 15\%$ for macronutrients, and $\pm 20\%$ for serving weight, flagging any hallucinated or clamped numbers."*
