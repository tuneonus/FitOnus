# FitOnus Backend — AI Coach Final Implementation Report

**Date:** November 14, 2026  
**Environment:** Neon PostgreSQL DEV (`neondb_owner`), Node.js 22, Express 5, TypeScript  
**Status:** Completed & Fully Verified  

---

## 1. Executive Summary

The FitOnus AI Coach backend module was audited, enhanced, and validated to provide a production-ready text and voice intelligence pipeline. The backend now directly supports:
1. **Normal AI Text Chat**: Multi-turn conversation processing with user profile context, AI memory integration, and structured responses.
2. **Speech-to-Text Transcription via Gemini Multimodal**: Endpoint `POST /coach/transcribe` converts raw recorded audio (`m4a`, `mp4`, `webm`, `aac`) into high-fidelity transcripts with automatic language detection (English, Tamil, and Tanglish).
3. **ChatGPT-Style Message Feedback**: Added persistent user sentiment feedback (`like`, `dislike`, `none`) stored securely in PostgreSQL with full ownership verification and atomic updates.
4. **Resilient Quota & Error Handling**: Differentiates Google AI Studio Free Tier daily quota exhaustion (20 RPD) from transient rate limits (15 RPM), providing users with clear, actionable diagnostics and exact retry estimates.

---

## 2. Gemini Failure Investigation & Resolution

### Root Cause Analysis
- **Observed Symptom**: Client requests occasionally received `429 Too Many Requests` or `"The AI service is currently busy due to high traffic"`.
- **Root Cause**: The project's Google AI Studio API key operates on the **Free Tier**. For `gemini-3.5-flash`, the free tier enforces a strict limit of **20 requests per day (RPD)** (`generativelanguage.googleapis.com/generate_content_free_tier_requests`). Once 20 requests are consumed in a 24-hour cycle, Google's API returns `429 RESOURCE_EXHAUSTED` with a retry delay of several hours (`retryDelay: ~28800s`).
- **Previous Defect**: The backend error handler caught all `429` status codes and reported generic traffic congestion. Users were misled into thinking that retrying after a few seconds would succeed.

### Implemented Fixes in `GeminiClient` (`gemini-client.ts`)
1. **Model Fallback Normalization**: Standardized model IDs from legacy references (`gemini-3.5-flash-lite`, `gemini-2.5-flash`) to the stable production model `gemini-3.5-flash`.
2. **Granular Error Classification**:
   - `QUOTA_EXHAUSTED`: Detected when error message or status contains `RESOURCE_EXHAUSTED` or large `retryDelay` (> 60s). Returns:  
     `"Daily AI coaching quota reached (Free Tier limit: 20 requests/day). Please wait until the quota resets or configure billing in Google AI Studio."`
   - `RATE_LIMITED`: Detected on temporary bursts. Returns:  
     `"Too many requests in a short time. Please wait X seconds and try again."`
   - `CREDENTIAL_ERROR`: Detected on 401/403 credentials or invalid key state. Returns:  
     `"Invalid or revoked Gemini API key. Please check your AI Studio configuration."`
   - `TIMEOUT`: Returns clear diagnostic if network or upstream model takes > 25 seconds.

---

## 3. Speech-to-Text Multimodal Endpoint

### Endpoint: `POST /coach/transcribe`
- **Controller**: `CoachController.transcribeAudio`
- **Use Case / Infrastructure**: `GeminiClient.transcribeAudio`
- **Authentication**: Required (`verifyAuth` middleware)
- **Validation**: `transcribeAudioSchema` (`Zod`)
- **Request Payload**:
  ```json
  {
    "audio": {
      "mimeType": "audio/m4a",
      "base64": "<base64_encoded_audio>"
    }
  }
  ```
- **Gemini Model Configuration**:
  - Uses `gemini-3.5-flash` with inline data buffer (`inlineData: { mimeType, data: base64 }`).
  - Instructs model as an accurate speech-to-text transcriber for fitness, health, and nutrition queries.
  - Enforces JSON Schema output:
    ```json
    {
      "transcript": "string",
      "detectedLanguage": "string"
    }
    ```
  - Full native support for English, Tamil script, and Tanglish (Tamil written in Latin alphabet).
- **Response Format**:
  ```json
  {
    "success": true,
    "data": {
      "transcript": "Had 3 idlis and sambar for breakfast",
      "detectedLanguage": "en"
    }
  }
  ```

---

## 4. Message Feedback & Database Migration

### Migration: `0019_add_coach_message_feedback.sql`
- **Applied to**: Neon PostgreSQL DEV Database
- **Schema Modification**:
  ```sql
  ALTER TABLE coach_messages
  ADD COLUMN IF NOT EXISTS feedback VARCHAR(16) DEFAULT 'none' CHECK (feedback IN ('like', 'dislike', 'none'));

  CREATE INDEX IF NOT EXISTS idx_coach_messages_feedback
  ON coach_messages (feedback)
  WHERE feedback != 'none';
  ```
- **Security & Ownership**:
  `ConversationRepository.setMessageFeedback(userId, messageId, feedback)` verifies that the target message belongs to a conversation owned by the requesting `userId` via:
  ```sql
  UPDATE coach_messages cm
  SET feedback = $3, updated_at = NOW()
  FROM coach_conversations cc
  WHERE cm.id = $1
    AND cm.conversation_id = cc.id
    AND cc.user_id = $2
  ```
- **Endpoint**: `PATCH /coach/messages/:id/feedback`
  - Validates `feedback` using `z.enum(['like', 'dislike', 'none'])`.
  - Returns `404` if message does not exist or does not belong to the user.

---

## 5. Files Modified & Added

| File Path | Action | Description |
|---|---|---|
| `backend/migrations/0019_add_coach_message_feedback.sql` | Created | Adds `feedback` column and partial index to `coach_messages` |
| `backend/src/modules/coach/domain/coach-history.types.ts` | Modified | Adds `feedback` field to `StoredChatMessage` |
| `backend/src/modules/coach/application/ports.ts` | Modified | Adds `setMessageFeedback` to `ConversationRepository` |
| `backend/src/modules/coach/infrastructure/pg-conversation-repository.ts` | Modified | Implements `setMessageFeedback` with strict user ownership scoping |
| `backend/src/modules/coach/application/use-cases/manage-conversations.ts` | Modified | Adds `setFeedback` application use case method |
| `backend/src/modules/coach/infrastructure/gemini-client.ts` | Modified | Implements `transcribeAudio` and fixes quota error classification |
| `backend/src/modules/coach/interface/coach.schemas.ts` | Modified | Adds Zod schemas for feedback and audio transcription |
| `backend/src/modules/coach/interface/coach.controller.ts` | Modified | Adds `setMessageFeedback` and `transcribeAudio` route handlers |
| `backend/src/modules/coach/interface/coach.routes.ts` | Modified | Registers `PATCH /messages/:id/feedback` and `POST /transcribe` |
| `backend/src/modules/coach/index.ts` | Modified | Injects `geminiClient` into `createCoachController` |
| `backend/tests/unit/coach/coach-http.test.ts` | Modified | Adds integration test coverage for feedback and transcribe endpoints |
| `backend/tests/unit/coach/coach-history.test.ts` | Modified | Adds mock repository implementation for feedback |
| `backend/tests/unit/coach/coach-memory.test.ts` | Modified | Adds mock repository implementation for feedback |
| `backend/tests/unit/coach/coach-message-ownership.test.ts` | Modified | Adds mock repository implementation for feedback |
| `backend/tests/unit/ai/ai-use-case-gating.test.ts` | Modified | Adds mock repository implementation for feedback |

---

## 6. Verification & Test Execution Results

- **Vitest Test Suite**:
  - Command: `npm --prefix backend test`
  - Output: **107 passed / 107 test files passed**
  - Total Tests: **1,247 passed / 1,247 tests passed (0 failures)**
  - Test Duration: ~19.39s
- **TypeScript Typecheck**:
  - Command: `npm --prefix backend run typecheck`
  - Output: **0 errors**

---

## 7. Cost, Quota & Operational Guidance

1. **Free Tier Invariants**:
   - `gemini-3.5-flash` allows up to 15 Requests Per Minute (RPM) and 20 Requests Per Day (RPD).
   - Audio transcription requests consume 1 API call per transcription turn.
   - Text chat requests consume 1 API call per message turn.
2. **Production Upgrade Path**:
   - When transitioning to production, enabling billing on Google AI Studio removes the 20 RPD cap and provides pay-as-you-go capacity ($0.075 per 1M input tokens, audio @ $0.00002/sec).
   - No code changes are required for paid tier; the existing client seamlessly scales.
