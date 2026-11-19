import { z } from 'zod';
import { currentAiRequestContext } from '../../../shared/ai/ai-usage.js';
import { callPythonAi, pythonUsageSchema, requireGateUserId } from '../../../shared/ai/python-ai-call.js';
import type { AiUsageRecorder, PythonAiClient } from '../../../shared/ai/python-ai-client.js';
import type { Logger } from '../../../shared/logging/logger.js';
import type { CoachChatService } from '../application/ports.js';
import type { Block, ChatMessageTurn, CoachResponse, UserFitnessContext } from '../domain/coach.types.js';

/** Token scope Python requires for this endpoint. */
export const COACH_CHAT_SCOPE = 'ai:coach:chat';
export const COACH_CHAT_PATH = '/internal/v1/ai/coach/chat';

/** Python's Gemini deadline is set this much below our HTTP timeout so Python can answer first. */
const DEADLINE_MARGIN_MS = 1_500;
/** Python rejects a deadline below this. */
const MIN_DEADLINE_MS = 1_000;

/** Shown to the user for every failure that is about the AI backend itself (nothing internal leaks). */
export const AI_BACKEND_UNAVAILABLE_MESSAGE = 'The AI Coach is temporarily unavailable. Please try again shortly.';

/** Python's reply. Mirrors ai-backend/contracts/coach_chat.py. */
const pythonChatResponseSchema = z.object({
  outcome: z.enum(['ok', 'unstructured']),
  result: z.object({
    text: z.string(),
    followUps: z.array(z.string()),
    sources: z.array(z.string()),
    medicalNote: z.boolean().nullish(),
    blocks: z.array(z.record(z.string(), z.unknown())).nullish(),
  }),
  usage: pythonUsageSchema,
  traceId: z.string(),
});

export interface PythonCoachChatDeps {
  client: PythonAiClient;
  /** Primary/fallback Gemini model names from the admin console; Python applies the fallback itself. */
  resolveModels: () => Promise<{ primary: string; fallback: string | null }>;
  /** Writes Python-served calls into the same usage ledger the rest of the AI features use. */
  usageRecorder?: AiUsageRecorder;
  /** HTTP timeout for the call to Python. */
  pythonTimeoutMs: number;
  logger?: Pick<Logger, 'info' | 'error'>;
}

/**
 * AI Coach chat text generation, served by the Python AI backend. This is the ONLY implementation:
 * there is no Node Gemini fallback. When Python cannot answer, the request fails with a controlled
 * error and the client may retry.
 *
 * What this class does NOT do (all still handled by `ChatWithCoachUseCase`, which calls it exactly as
 * it used to call the Node service): authentication, quota (`AiUsageGate`), loading context/history/
 * memories, and conversation persistence. It replaces only "prompt -> Gemini -> parsed reply".
 */
export class PythonCoachChatService implements CoachChatService {
  constructor(private readonly deps: PythonCoachChatDeps) {}

  async generateCoachResponse(
    message: string,
    context: UserFitnessContext,
    history: ChatMessageTurn[] = [],
    memories: string[] = [],
  ): Promise<CoachResponse> {
    // Identity comes from the server-side request context set by the AI usage gate, never from input.
    const userId = requireGateUserId(currentAiRequestContext()?.userId);

    const models = await this.deps.resolveModels();
    const timeoutMs = this.deps.pythonTimeoutMs;
    const { result } = await callPythonAi({
      client: this.deps.client,
      path: COACH_CHAT_PATH,
      scope: COACH_CHAT_SCOPE,
      userId,
      requestId: `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      timeoutMs,
      body: {
        message,
        context,
        history,
        memories,
        model: { primary: models.primary, fallback: models.fallback },
        deadlineMs: Math.max(MIN_DEADLINE_MS, timeoutMs - DEADLINE_MARGIN_MS),
      },
      schema: pythonChatResponseSchema,
      feature: 'coach_chat',
      usageRecorder: this.deps.usageRecorder,
      logger: this.deps.logger,
      label: 'Python coach chat',
      unavailableMessage: AI_BACKEND_UNAVAILABLE_MESSAGE,
    });

    // The same shape the mobile app has always received (no medicalNote/blocks keys when absent).
    return {
      text: result.text,
      followUps: result.followUps,
      sources: result.sources,
      ...(typeof result.medicalNote === 'boolean' ? { medicalNote: result.medicalNote } : {}),
      ...(result.blocks ? { blocks: result.blocks as unknown as Block[] } : {}),
    };
  }
}
