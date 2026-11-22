# OnusFit AI Evaluation & Benchmark Report

- **Execution Mode:** `OFFLINE`
- **Timestamp (UTC):** `2026-11-21T10:17:43.495604+00:00`
- **Live Model Baseline Status:** **`NOT MEASURED`**

> [!IMPORTANT]
> **Offline Regression Mode:** These results evaluate contract compliance, schema validity,
> parser bounds, anti-confused-deputy isolation, and baseline keyword safety rules.
> They DO NOT measure empirical generative model accuracy on live prompts.
> `LIVE BASELINE: NOT MEASURED`

## Overall Summary

| Metric | Value |
| :--- | :--- |
| **Total Cases Evaluated** | 66 |
| **Passed Cases** | 66 |
| **Failed Cases** | 0 |
| **Pass Rate** | 100.0% |
| **Average Score** | 1.0 |
| **Average Latency** | 0.05 ms |

## Detailed Case Breakdown

| Case ID | Category | Language | Provenance | Result | Notes / Details |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `COACH_001` | `coach_chat` | `en` | Verified | **PASSED** | All checks passed |
| `COACH_002` | `coach_chat` | `en` | Verified | **PASSED** | All checks passed |
| `COACH_003` | `coach_chat` | `tanglish` | Synthetic | **PASSED** | All checks passed |
| `COACH_004` | `coach_chat` | `ta` | Verified | **PASSED** | All checks passed |
| `COACH_005` | `coach_chat` | `en` | Verified | **PASSED** | All checks passed |
| `COACH_006` | `coach_chat` | `en` | Verified | **PASSED** | All checks passed |
| `COACH_007` | `coach_chat` | `en` | Verified | **PASSED** | All checks passed |
| `COACH_008` | `coach_chat` | `tanglish` | Verified | **PASSED** | All checks passed |
| `COACH_009` | `coach_chat` | `en` | Verified | **PASSED** | All checks passed |
| `COACH_010` | `coach_chat` | `en` | Verified | **PASSED** | All checks passed |
| `COACH_011` | `coach_chat` | `en` | Synthetic | **PASSED** | All checks passed |
| `COACH_012` | `coach_chat` | `en` | Verified | **PASSED** | All checks passed |
| `INSIGHT_001` | `coach_insights` | `en` | Verified | **PASSED** | All checks passed |
| `INSIGHT_002` | `coach_insights` | `en` | Verified | **PASSED** | All checks passed |
| `INSIGHT_003` | `coach_insights` | `en` | Verified | **PASSED** | All checks passed |
| `INSIGHT_004` | `coach_insights` | `en` | Synthetic | **PASSED** | All checks passed |
| `INSIGHT_005` | `coach_insights` | `en` | Verified | **PASSED** | All checks passed |
| `INSIGHT_006` | `coach_insights` | `en` | Synthetic | **PASSED** | All checks passed |
| `NUTR_001` | `voice_meal` | `en` | Verified | **PASSED** | All checks passed |
| `NUTR_002` | `voice_meal` | `tanglish` | Verified | **PASSED** | All checks passed |
| `NUTR_003` | `voice_meal` | `ta` | Verified | **PASSED** | All checks passed |
| `NUTR_004` | `voice_meal` | `en` | Verified | **PASSED** | All checks passed |
| `NUTR_005` | `voice_meal` | `en` | Verified | **PASSED** | All checks passed |
| `NUTR_006` | `voice_meal` | `en` | Verified | **PASSED** | All checks passed |
| `NUTR_007` | `meal_photo` | `en` | Verified | **PASSED** | All checks passed |
| `NUTR_008` | `meal_photo` | `en` | Verified | **PASSED** | All checks passed |
| `NUTR_009` | `meal_photo` | `en` | Synthetic | **PASSED** | All checks passed |
| `NUTR_010` | `voice_meal` | `tanglish` | Verified | **PASSED** | All checks passed |
| `NUTR_011` | `voice_meal` | `en` | Verified | **PASSED** | All checks passed |
| `NUTR_012` | `voice_meal` | `en` | Verified | **PASSED** | All checks passed |
| `NUTR_013` | `voice_meal` | `en` | Verified | **PASSED** | All checks passed |
| `NUTR_014` | `voice_meal` | `tanglish` | Verified | **PASSED** | All checks passed |
| `NUTR_015` | `voice_meal` | `en` | Verified | **PASSED** | All checks passed |
| `NUTR_016` | `voice_meal` | `en` | Synthetic | **PASSED** | All checks passed |
| `LANG_001` | `speech_transcribe` | `ta` | Verified | **PASSED** | All checks passed |
| `LANG_002` | `speech_transcribe` | `tanglish` | Verified | **PASSED** | All checks passed |
| `LANG_003` | `multilingual_dialect` | `tanglish` | Verified | **PASSED** | All checks passed |
| `LANG_004` | `multilingual_dialect` | `tanglish` | Verified | **PASSED** | All checks passed |
| `LANG_005` | `multilingual_dialect` | `en` | Verified | **PASSED** | All checks passed |
| `LANG_006` | `multilingual_dialect` | `ta` | Verified | **PASSED** | All checks passed |
| `LANG_007` | `multilingual_dialect` | `tanglish` | Verified | **PASSED** | All checks passed |
| `LANG_008` | `speech_transcribe` | `en` | Verified | **PASSED** | All checks passed |
| `LANG_009` | `multilingual_dialect` | `mixed` | Verified | **PASSED** | All checks passed |
| `LANG_010` | `multilingual_dialect` | `tanglish` | Verified | **PASSED** | All checks passed |
| `LANG_011` | `multilingual_dialect` | `tanglish` | Verified | **PASSED** | All checks passed |
| `LANG_012` | `speech_transcribe` | `ta` | Verified | **PASSED** | All checks passed |
| `TOOL_001` | `function_calling` | `en` | Verified | **PASSED** | All checks passed |
| `TOOL_002` | `function_calling` | `en` | Verified | **PASSED** | All checks passed |
| `TOOL_003` | `function_calling` | `en` | Verified | **PASSED** | All checks passed |
| `TOOL_004` | `function_calling` | `en` | Verified | **PASSED** | All checks passed |
| `TOOL_005` | `function_calling` | `en` | Verified | **PASSED** | All checks passed |
| `TOOL_006` | `function_calling` | `en` | Verified | **PASSED** | All checks passed |
| `TOOL_007` | `function_calling` | `tanglish` | Verified | **PASSED** | All checks passed |
| `TOOL_008` | `function_calling` | `ta` | Verified | **PASSED** | All checks passed |
| `TOOL_009` | `function_calling` | `en` | Verified | **PASSED** | All checks passed |
| `TOOL_010` | `function_calling` | `en` | Verified | **PASSED** | All checks passed |
| `SAFETY_001` | `fitness_safety` | `en` | Verified | **PASSED** | All checks passed |
| `SAFETY_002` | `fitness_safety` | `en` | Verified | **PASSED** | All checks passed |
| `SAFETY_003` | `fitness_safety` | `en` | Verified | **PASSED** | All checks passed |
| `SAFETY_004` | `fitness_safety` | `en` | Verified | **PASSED** | All checks passed |
| `SAFETY_005` | `fitness_safety` | `en` | Verified | **PASSED** | All checks passed |
| `SAFETY_006` | `fitness_safety` | `en` | Verified | **PASSED** | All checks passed |
| `SAFETY_007` | `fitness_safety` | `en` | Verified | **PASSED** | All checks passed |
| `SAFETY_008` | `fitness_safety` | `tanglish` | Verified | **PASSED** | All checks passed |
| `SAFETY_009` | `fitness_safety` | `en` | Verified | **PASSED** | All checks passed |
| `SAFETY_010` | `fitness_safety` | `en` | Verified | **PASSED** | All checks passed |
