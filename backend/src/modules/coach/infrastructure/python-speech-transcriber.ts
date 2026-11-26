import { z } from 'zod';
import { defaultAiMetrics } from '../../../shared/ai/ai-metrics.js';
import {
  inspectSafeBase64Payload,
  isSupportedAudioMime,
  MAX_AUDIO_BASE64_CHARS,
} from '../../../shared/ai/audio-input.js';
import { callPythonAi, pythonUsageSchema } from '../../../shared/ai/python-ai-call.js';
import type { AiUsageRecorder, PythonAiClient } from '../../../shared/ai/python-ai-client.js';
import { AppError } from '../../../shared/errors/app-error.js';
import type { Logger } from '../../../shared/logging/logger.js';
import type { SpeechTranscriber } from '../application/ports.js';

/** Token scope Python requires for this endpoint. */
export const TRANSCRIBE_SCOPE = 'ai:speech:transcribe';
export const TRANSCRIBE_PATH = '/internal/v1/ai/speech/transcribe';

/** Python's Gemini deadline is set this much below our HTTP timeout so Python can answer first. */
const DEADLINE_MARGIN_MS = 1_500;
const MIN_DEADLINE_MS = 1_000;

/** The wording the app has always received when transcription fails for infrastructure reasons. */
export const TRANSCRIBE_UNAVAILABLE_MESSAGE =
  'Unable to transcribe spoken audio right now. Please try again.';

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
    const valStart = performance.now();
    const approxBytes = Math.floor(((audio.base64?.length ?? 0) * 3) / 4);
    const recordValidationReject = (reason: string) => {
      try {
        defaultAiMetrics.recordMultimodalProcessing({
          modality: 'audio',
          durationMs: Math.round(performance.now() - valStart),
          validationDurationMs: Math.round(performance.now() - valStart),
          validationFailed: true,
          validationReason: reason,
          byteSize: approxBytes,
        });
      } catch {
        // Fail-open observability
      }
    };

    const mimeType = audio.mimeType || 'audio/m4a';
    if (!isSupportedAudioMime(mimeType)) {
      recordValidationReject('invalid_mime');
      throw new AppError(
        'bad_request',
        'BAD_REQUEST',
        `Unsupported audio format (${mimeType}). Supported formats: m4a, mp4, aac, wav, webm, ogg.`,
      );
    }
    if (!audio.base64 || audio.base64.length > MAX_AUDIO_BASE64_CHARS) {
      recordValidationReject(audio.base64 ? 'oversize' : 'empty_payload');
      throw new AppError(
        audio.base64 ? 'payload_too_large' : 'validation',
        audio.base64 ? 'PAYLOAD_TOO_LARGE' : 'VALIDATION_FAILED',
        audio.base64 ? 'Audio size exceeds the 15MB limit.' : 'Audio data is required.',
      );
    }
    const inspection = inspectSafeBase64Payload(audio.base64, 'audio');
    if (!inspection.ok) {
      recordValidationReject(inspection.reason === 'empty' ? 'empty_payload' : 'polyglot');
      throw new AppError(
        'validation',
        'VALIDATION_FAILED',
        inspection.reason === 'empty'
          ? 'Audio data is empty or unreadable.'
          : 'Audio payload contains unsupported or unsafe content.',
      );
    }

    const models = await this.deps.resolveModels();
    const timeoutMs = this.deps.pythonTimeoutMs;
    const startedAt = performance.now();
    try {
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

      try {
        defaultAiMetrics.recordMultimodalProcessing({
          modality: 'audio',
          durationMs: Math.round(performance.now() - startedAt),
          byteSize: approxBytes,
        });
      } catch {
        // Fail-open observability
      }

      return { transcript: result.transcript, detectedLanguage: result.detectedLanguage };
    } catch (error) {
      try {
        defaultAiMetrics.recordMultimodalProcessing({
          modality: 'audio',
          durationMs: Math.round(performance.now() - startedAt),
          processingError: true,
          byteSize: approxBytes,
        });
      } catch {
        // Fail-open observability
      }
      throw error;
    }
  }
}
