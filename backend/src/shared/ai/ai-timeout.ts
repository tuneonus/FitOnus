import { AppError } from '../errors/app-error.js';

/** The only text a client ever sees for a provider timeout. Nothing about the provider leaks. */
export const AI_TIMEOUT_MESSAGE = 'AI request timed out. Please try again.';

/**
 * A provider call exceeded its deadline. It is a regular `unavailable` / `SERVICE_UNAVAILABLE`
 * AppError (HTTP 503), so existing handlers and clients treat it like any other transient AI failure;
 * the subclass only lets telemetry tell a timeout apart from other provider errors.
 */
export class AiTimeoutError extends AppError {
  constructor() {
    super('unavailable', 'SERVICE_UNAVAILABLE', AI_TIMEOUT_MESSAGE);
  }
}

export const isAiTimeoutError = (error: unknown): error is AiTimeoutError => error instanceof AiTimeoutError;

/**
 * Runs one provider call under a hard deadline.
 *
 * - `work` receives an AbortSignal that MUST be forwarded to the provider request: at the deadline it
 *   is aborted, which cancels the in-flight HTTP request instead of leaving it running in the background.
 * - The caller stops waiting at the deadline even if `work` ignores the signal (race), and always
 *   gets an `AiTimeoutError`, never the raw AbortError.
 * - `work` is invoked exactly once. There is no retry here: a timed-out call has already been
 *   dispatched (and billed) and the caller's quota unit is consumed.
 */
export async function runWithAiTimeout<T>(
  timeoutMs: number,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;

  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      // Reject first so the caller observes the timeout, not the AbortError that the abort triggers.
      reject(new AiTimeoutError());
      controller.abort();
    }, timeoutMs);
  });

  const run = (async () => work(controller.signal))();
  // If the deadline wins, `work` may still reject later (typically with an AbortError). Nobody awaits
  // it any more, so mark it handled to avoid an unhandled rejection.
  run.catch(() => undefined);

  try {
    return await Promise.race([run, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
