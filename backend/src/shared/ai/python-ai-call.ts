import { z } from 'zod';
import { AppError } from '../errors/app-error.js';
import { redactSensitiveText, type Logger } from '../logging/logger.js';
import { currentCorrelationId } from '../logging/request-correlation.js';
import type { GeminiFeature } from './gemini-feature.js';
import { defaultAiMetrics } from './ai-metrics.js';
import {
  INVALID_OUTPUT_OUTCOMES,
  aiCallCompletedFields,
  aiCallFailedFields,
  classifyPythonAiError,
  tagAiErrorCategory,
} from './ai-observability.js';
import { withAiSpan } from './ai-tracing.js';
import { markAiRequestDispatched } from './ai-usage.js';
import { toPublicAiError } from './python-ai-errors.js';
import type { AiUsageRecorder, PythonAiClient } from './python-ai-client.js';
import { PythonAiError } from './python-ai-client.js';

const intNumber = z.number().int().nonnegative();

/** The `usage` block every internal Python endpoint returns (ai-backend/src/onusfit_ai/shared/contracts/common.py `Usage`). */
export const pythonUsageSchema = z.object({
  model: z.string(),
  isFallback: z.boolean(),
  inputTokens: intNumber,
  outputTokens: intNumber,
  cachedTokens: intNumber,
  thinkingTokens: intNumber,
  totalTokens: intNumber,
  durationMs: intNumber,
});

/** Every Python reply carries an `outcome` and `usage`; each feature adds its own `result`. */
type PythonReply = { outcome: string; usage: z.output<typeof pythonUsageSchema> };

export interface PythonAiCall<S extends z.ZodType<PythonReply>> {
  client: PythonAiClient;
  path: string;
  /** Token scope Python requires for this endpoint. */
  scope: string;
  /** The authenticated user (goes into the token `sub` only, never the body). */
  userId: string;
  requestId: string;
  timeoutMs: number;
  body: unknown;
  /** Validates Python's reply: data from another process is never trusted unchecked. */
  schema: S;
  /** Label used in the usage ledger. */
  feature: GeminiFeature;
  usageRecorder?: AiUsageRecorder | undefined;
  logger?: Pick<Logger, 'info' | 'error'> | undefined;
  /** Log label, e.g. "Python voice meal". */
  label: string;
  /** User-facing text when the AI backend itself is the problem (nothing internal leaks). */
  unavailableMessage: string;
  /** Optional caller abort signal forwarded to the underlying HTTP client. */
  signal?: AbortSignal | undefined;
}

/**
 * One call to the Python AI backend with the behavior every migrated feature shares:
 *  - the request is sent exactly once (no retries, no second AI call anywhere),
 *  - the quota gate is told Gemini may have been called (`markAiRequestDispatched`) unless the call
 *    provably never reached Python, so refund-vs-consume stays correct,
 *  - the reply is validated, then tokens are written to the usage ledger (a ledger failure never
 *    fails the request),
 *  - any failure becomes one controlled public error via `toPublicAiError`.
 *
 * `markAiRequestDispatched` is a no-op outside the AI usage gate (for example transcription, which
 * has no quota gate), so callers need no special case.
 *
 * Observability (changes nothing above): the HTTP request's correlation id travels to Python in
 * `X-Correlation-Id`, and exactly one structured event is logged per call - `ai.call.completed` or
 * `ai.call.failed` - holding ids, feature, model, durations, tokens and an error category, never content.
 */
export async function callPythonAi<S extends z.ZodType<PythonReply>>(
  call: PythonAiCall<S>,
): Promise<z.output<S>> {
  const correlationId = currentCorrelationId();
  const ids = { correlationId, aiRequestId: call.requestId };
  const startedAt = performance.now();
  const elapsedMs = () => Math.round(performance.now() - startedAt);

  try {
    const raw = await withAiSpan(
      'ai.python.call',
      { attributes: { feature: call.feature, endpoint: call.path, aiRequestId: call.requestId } },
      () =>
        call.client.postJson({
          path: call.path,
          scope: call.scope,
          userId: call.userId,
          requestId: call.requestId,
          correlationId,
          timeoutMs: call.timeoutMs,
          body: call.body,
          ...(call.signal ? { signal: call.signal } : {}),
        }),
    );

    // The request definitely reached Python, so Gemini may have been billed.
    markAiRequestDispatched();

    const parsed = call.schema.safeParse(raw);
    if (!parsed.success) {
      throw new PythonAiError('invalid_response', 'AI backend response did not match the contract.', {
        dispatched: true,
      });
    }
    const { usage, outcome } = parsed.data;

    // Isolated, awaited usage persistence for successful provider call
    if (call.usageRecorder && usage) {
      try {
        await call.usageRecorder.recordExternalUsage({
          requestId: call.requestId,
          userId: call.userId,
          feature: call.feature,
          model: usage.model,
          status: 'success',
          isFallback: usage.isFallback,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cachedTokens: usage.cachedTokens,
          totalTokens: usage.totalTokens,
          durationMs: usage.durationMs,
          errorCategory: usage.isFallback ? 'FALLBACK_SUCCESS' : null,
        });
      } catch (ledgerError) {
        call.logger?.error(
          {
            event: 'ledger_persistence_failed',
            ...ids,
            feature: call.feature,
            error: redactSensitiveText(
              ledgerError instanceof Error ? ledgerError.message : String(ledgerError),
            ),
            status: 'success',
          },
          'Failed to persist Gemini usage event to database',
        );
      }
    }

    const totalMs = elapsedMs();
    try {
      const unusable = INVALID_OUTPUT_OUTCOMES.has(outcome);
      defaultAiMetrics.recordLlmCall({
        feature: call.feature,
        model: usage.model,
        durationMs: totalMs,
        success: !unusable,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedTokens: usage.cachedTokens,
        thinkingTokens: usage.thinkingTokens,
        totalTokens: usage.totalTokens,
        isFallback: usage.isFallback,
        errorCategory: unusable ? 'invalid_ai_response' : null,
      });
    } catch {
      // Fail-open observability
    }

    call.logger?.info(
      aiCallCompletedFields({
        ids,
        feature: call.feature,
        endpoint: call.path,
        outcome,
        usage,
        durationMs: totalMs,
      }),
      `${call.label} served`,
    );
    return parsed.data;
  } catch (error) {
    const failure =
      error instanceof PythonAiError
        ? error
        : // A bug on our side before anything was sent.
          new PythonAiError('server_error', 'Unexpected error preparing the AI backend call.', {
            dispatched: false,
          });

    // If Gemini may have been called, the quota unit stays consumed; otherwise the gate refunds it.
    if (failure.dispatched) markAiRequestDispatched();

    // Isolated, awaited usage persistence for failed provider call if usage was returned
    if (call.usageRecorder && failure.info.usage) {
      const usageParse = pythonUsageSchema.safeParse(failure.info.usage);
      if (usageParse.success) {
        const u = usageParse.data;
        try {
          await call.usageRecorder.recordExternalUsage({
            requestId: call.requestId,
            userId: call.userId,
            feature: call.feature,
            model: u.model,
            status: 'failed',
            isFallback: u.isFallback,
            inputTokens: u.inputTokens,
            outputTokens: u.outputTokens,
            cachedTokens: u.cachedTokens,
            totalTokens: u.totalTokens,
            durationMs: u.durationMs,
            errorCategory: failure.info.code || failure.kind,
          });
        } catch (ledgerError) {
          call.logger?.error(
            {
              event: 'ledger_persistence_failed',
              ...ids,
              feature: call.feature,
              error: redactSensitiveText(
                ledgerError instanceof Error ? ledgerError.message : String(ledgerError),
              ),
              status: 'failed',
            },
            'Failed to persist failed Gemini usage event to database',
          );
        }
      }
    }

    const totalMs = elapsedMs();
    const category = classifyPythonAiError(failure);
    try {
      defaultAiMetrics.recordLlmCall({
        feature: call.feature,
        durationMs: totalMs,
        success: false,
        errorCategory: category,
        timeout: category === 'gemini_timeout' || category === 'python_timeout',
      });
    } catch {
      // Fail-open observability
    }

    call.logger?.error(
      aiCallFailedFields({
        ids,
        feature: call.feature,
        endpoint: call.path,
        error: failure,
        durationMs: totalMs,
      }),
      `${call.label} failed`,
    );
    // The public error keeps its shape; the category rides along out of band for callers that degrade (insights).
    throw tagAiErrorCategory(toPublicAiError(failure, call.unavailableMessage), category);
  }
}

/** Server-side only identity check shared by adapters that run inside the AI usage gate. */
export function requireGateUserId(userId: string | undefined): string {
  if (!userId) throw new AppError('internal', 'INTERNAL_ERROR', 'AI request context is missing.');
  return userId;
}
