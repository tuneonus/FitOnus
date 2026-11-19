import { z } from 'zod';
import { AppError } from '../errors/app-error.js';
import type { Logger } from '../logging/logger.js';
import type { GeminiFeature } from './gemini-feature.js';
import { markAiRequestDispatched } from './ai-usage.js';
import { toPublicAiError } from './python-ai-errors.js';
import type { AiUsageRecorder, PythonAiClient } from './python-ai-client.js';
import { PythonAiError } from './python-ai-client.js';

const intNumber = z.number().int().nonnegative();

/** The `usage` block every internal Python endpoint returns (ai-backend/contracts/common.py `Usage`). */
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
 */
export async function callPythonAi<S extends z.ZodType<PythonReply>>(call: PythonAiCall<S>): Promise<z.output<S>> {
  try {
    const raw = await call.client.postJson({
      path: call.path,
      scope: call.scope,
      userId: call.userId,
      requestId: call.requestId,
      timeoutMs: call.timeoutMs,
      body: call.body,
    });

    // The request definitely reached Python, so Gemini may have been billed.
    markAiRequestDispatched();

    const parsed = call.schema.safeParse(raw);
    if (!parsed.success) {
      throw new PythonAiError('invalid_response', 'AI backend response did not match the contract.', {
        dispatched: true,
      });
    }
    const { usage, outcome } = parsed.data;

    call.usageRecorder
      ?.recordExternalUsage({
        requestId: call.requestId,
        userId: call.userId,
        feature: call.feature,
        model: usage.model,
        isFallback: usage.isFallback,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedTokens: usage.cachedTokens,
        totalTokens: usage.totalTokens,
        durationMs: usage.durationMs,
      })
      .catch(() => undefined);
    call.logger?.info(
      { requestId: call.requestId, outcome, model: usage.model, fallbackModel: usage.isFallback, tokens: usage.totalTokens },
      `${call.label} served`,
    );
    return parsed.data;
  } catch (error) {
    const failure =
      error instanceof PythonAiError
        ? error
        : // A bug on our side before anything was sent.
          new PythonAiError('server_error', 'Unexpected error preparing the AI backend call.', { dispatched: false });

    // If Gemini may have been called, the quota unit stays consumed; otherwise the gate refunds it.
    if (failure.dispatched) markAiRequestDispatched();
    call.logger?.error(
      { kind: failure.kind, status: failure.info.status, code: failure.info.code, requestId: call.requestId },
      `${call.label} failed`,
    );
    throw toPublicAiError(failure, call.unavailableMessage);
  }
}

/** Server-side only identity check shared by adapters that run inside the AI usage gate. */
export function requireGateUserId(userId: string | undefined): string {
  if (!userId) throw new AppError('internal', 'INTERNAL_ERROR', 'AI request context is missing.');
  return userId;
}
