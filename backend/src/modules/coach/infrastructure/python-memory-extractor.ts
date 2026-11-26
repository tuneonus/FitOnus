import { z } from 'zod';
import type { AiUsageRecorder, PythonAiClient } from '../../../shared/ai/python-ai-client.js';
import { callPythonAi, pythonUsageSchema } from '../../../shared/ai/python-ai-call.js';
import type { Logger } from '../../../shared/logging/logger.js';
import type { ChatMessageTurn, ExtractedCandidate, MemoryExtractor } from '../application/ports.js';

export const MEMORY_EXTRACT_PATH = '/internal/v1/ai/coach/memories/extract';
export const MEMORY_EXTRACT_SCOPE = 'ai:coach:chat';

const memoryCandidateSchema = z.object({
  category: z.enum([
    'goals',
    'injuries',
    'food',
    'workout',
    'medical',
    'supplements',
    'progress',
    'conversations',
  ]),
  text: z.string(),
  confidence: z.number(),
  sensitive: z.boolean(),
  sourceQuote: z.string(),
  supersedesQuote: z.string().nullish(),
});

const memoryExtractionResponseSchema = z.object({
  outcome: z.string(),
  candidates: z.array(memoryCandidateSchema),
  usage: pythonUsageSchema,
  traceId: z.string(),
});

export interface PythonMemoryExtractorDeps {
  client: PythonAiClient;
  resolveModels: () => Promise<{ primary: string; fallback: string | null }>;
  pythonTimeoutMs: number;
  usageRecorder?: AiUsageRecorder;
  logger?: Pick<Logger, 'info' | 'warn' | 'error'>;
}

export class PythonMemoryExtractor implements MemoryExtractor {
  constructor(private readonly deps: PythonMemoryExtractorDeps) {}

  async extract(
    userId: string,
    turns: ChatMessageTurn[],
    existingMemories: string[] = [],
  ): Promise<ExtractedCandidate[]> {
    const models = await this.deps.resolveModels();
    const timeoutMs = this.deps.pythonTimeoutMs || 15000;

    const response = await callPythonAi({
      client: this.deps.client,
      path: MEMORY_EXTRACT_PATH,
      scope: MEMORY_EXTRACT_SCOPE,
      userId,
      requestId: `mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      timeoutMs,
      body: {
        turns,
        existingMemories,
        model: { primary: models.primary, fallback: models.fallback ?? undefined },
        deadlineMs: Math.max(1000, timeoutMs - 1500),
      },
      schema: memoryExtractionResponseSchema,
      feature: 'coach_chat',
      usageRecorder: this.deps.usageRecorder,
      logger: this.deps.logger,
      label: 'Python memory extraction',
      unavailableMessage: 'Memory extraction unavailable',
    });

    return response.candidates.map((c) => ({
      category: c.category,
      text: c.text,
      confidence: c.confidence,
      sensitive: c.sensitive,
      sourceQuote: c.sourceQuote,
      supersedesQuote: c.supersedesQuote ?? null,
    }));
  }
}
