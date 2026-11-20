import { z } from 'zod';
import { callPythonAi, pythonUsageSchema } from '../../../shared/ai/python-ai-call.js';
import type { AiUsageRecorder, PythonAiClient } from '../../../shared/ai/python-ai-client.js';
import type { Logger } from '../../../shared/logging/logger.js';
import type { SpeechTranscriber } from '../application/ports.js';

/** Token scope Python requires for this endpoint. */
export const TRANSCRIBE_SCOPE = 'ai:speech:transcribe';
export const TRANSCRIBE_PATH = '/internal/v1/ai/speech/transcribe';

/** Python's Gemini deadline is set this much below our HTTP timeout so Python can answer first. */
const DEADLINE_MARGIN_MS = 1_500;
const MIN_DEADLINE_MS = 1_000;

/** The wording the app has always received when transcription fails for infrastructure reasons. */
export const TRANSCRIBE_UNAVAILABLE_MESSAGE = 'Unable to transcribe spoken audio right now. Please try again.';

/** Python's reply. Mirrors ai-backend/src/onusfit_ai/features/speech/application/contracts.py. */
const pythonTranscribeResponseSchema = z.object({
  outcome: z.enum(['ok', 'unstructured']),
  result: z.object({ transcript: z.string(), detectedLanguage: z.string() }),
  usage: pythonUsageSchema,
  traceId: z.string(),
});

export interface PythonSpeechTranscriberDeps {
  client: PythonAiClient;
  /** Primary/fallback Gemini model names from the admin console; Python applies the fallback itself. */
  resolveModels: () => Promise<{ primary: string; fallback: string | null }>;
  usageRecorder?: AiUsageRecorder;
  /** HTTP timeout for the call to Python. The app waits 35 s, and the configured maximum is 28 s. */
  pythonTimeoutMs: number;
  logger?: Pick<Logger, 'info' | 'error'>;
}

/**
 * Speech transcription (`POST /coach/transcribe`), served only by the Python AI backend.
 *
 * Behavior kept from the Node implementation: the endpoint has NO AI quota gate (only the route's
 * rate limiter and the authentication check apply), so the user id is passed in explicitly from the
 * authenticated session instead of being read from the quota gate's request context.
 */
export class PythonSpeechTranscriber implements SpeechTranscriber {
  constructor(private readonly deps: PythonSpeechTranscriberDeps) {}

  async transcribe(
    userId: string,
    audio: { mimeType: string; base64: string },
  ): Promise<{ transcript: string; detectedLanguage: string }> {
    const models = await this.deps.resolveModels();
    const timeoutMs = this.deps.pythonTimeoutMs;

    const { result } = await callPythonAi({
      client: this.deps.client,
      path: TRANSCRIBE_PATH,
      scope: TRANSCRIBE_SCOPE,
      userId,
      requestId: `stt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      timeoutMs,
      body: {
        audio: { mimeType: audio.mimeType, base64: audio.base64 },
        model: { primary: models.primary, fallback: models.fallback },
        deadlineMs: Math.max(MIN_DEADLINE_MS, timeoutMs - DEADLINE_MARGIN_MS),
      },
      schema: pythonTranscribeResponseSchema,
      // Same ledger label the Node implementation used (the model setting is the coach model too).
      feature: 'coach_chat',
      usageRecorder: this.deps.usageRecorder,
      logger: this.deps.logger,
      label: 'Python transcription',
      unavailableMessage: TRANSCRIBE_UNAVAILABLE_MESSAGE,
    });

    return { transcript: result.transcript, detectedLanguage: result.detectedLanguage };
  }
}
