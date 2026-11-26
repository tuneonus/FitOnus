/**
 * Centralized Coach Context Assembler.
 * FitOnus Phase 08: Context Engineering — Stage 01.
 *
 * Responsibilities:
 * 1. Coordinates user profile, conversation history, memories, and RAG knowledge.
 * 2. Executes intent-based context routing (Stage 03) to avoid unnecessary DB/vector queries.
 * 3. Enforces cross-context deduplication (Stage 04).
 * 4. Applies unified token envelope budgeting and waterfall shedding (Stage 02).
 * 5. Strictly preserves Phase 07 user consent and sensitive memory protections.
 */

import type { Logger } from '../../../../shared/logging/logger.js';
import { withAiSpan } from '../../../../shared/ai/ai-tracing.js';
import type { KnowledgeService } from '../../../knowledge/index.js';
import type {
  ConversationRepository,
  KnowledgeContextPayloadItem,
  MemoryRepository,
  UserContextRepository,
} from '../ports.js';
import type { ChatMessageTurn, UserFitnessContext } from '../../domain/coach.types.js';
import {
  applyContextBudget,
  type ContextTokenBudgets,
  type ContextTokenStats,
} from '../../domain/context-budget.js';
import { deduplicateContextMemories } from '../../domain/context-deduplicator.js';
import { routeCoachQueryIntent, type CoachQueryIntent } from '../../domain/intent-router.js';

export interface AssembleContextInput {
  userId: string;
  message: string;
  timezone?: string | null;
  conversationId?: string | null;
  clientMessageId?: string | null;
  clientHistory?: ChatMessageTurn[];
  maxHistoryTokens?: number;
  budgets?: Partial<ContextTokenBudgets>;
}

export interface AssembledCoachContext {
  context: UserFitnessContext;
  history: ChatMessageTurn[];
  memories: string[];
  knowledge: KnowledgeContextPayloadItem[];
  intent: CoachQueryIntent;
  tokenStats: ContextTokenStats;
}

export interface ContextAssemblerDependencies {
  userContextRepo: UserContextRepository;
  conversationRepo?: ConversationRepository;
  memoryRepo?: MemoryRepository;
  knowledgeService?: KnowledgeService;
  logger?: Pick<Logger, 'info' | 'warn'>;
}

export class CoachContextAssembler {
  constructor(private readonly deps: ContextAssemblerDependencies) {}

  async assemble(input: AssembleContextInput): Promise<AssembledCoachContext> {
    const trimmedMessage = input.message.trim();
    const timezone = input.timezone || 'UTC';

    // 1. Intent-Based Routing: classify intent to determine retrieval gates
    const routing = routeCoachQueryIntent(trimmedMessage);

    // 2. Load User Profile and today's local fitness metrics
    const userContext = await this.deps.userContextRepo.getUserFitnessContext(input.userId, timezone);

    // 3. Resolve Conversation History (prioritize client history if provided, else DB)
    let candidateHistory: ChatMessageTurn[] = input.clientHistory ?? [];
    if (candidateHistory.length === 0 && this.deps.conversationRepo && input.conversationId) {
      const pastMessages = await this.deps.conversationRepo.getMessages(
        input.userId,
        input.conversationId,
        15,
      );
      candidateHistory = pastMessages
        .filter((m) => m.id !== input.clientMessageId && m.text && m.text.trim().length > 0)
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          text: m.text,
        }));
    }

    // 4. Resolve Approved User Memories (only if intent allows and user consented)
    let candidateMemories: string[] = [];
    if (routing.shouldRetrieveMemories && this.deps.memoryRepo) {
      const rawMemories = await this.deps.memoryRepo.getActiveMemoriesForContext(
        input.userId,
        trimmedMessage,
      );
      // Stage 04: Deduplicate memories against current profile and active goals
      candidateMemories = deduplicateContextMemories(
        rawMemories,
        userContext.profile,
        userContext.activeGoals,
      );
    }

    // 5. Resolve Grounded Knowledge (RAG) — skipped for greetings/metrics
    let candidateKnowledge: KnowledgeContextPayloadItem[] = [];
    if (routing.shouldRetrieveRag && this.deps.knowledgeService) {
      try {
        await withAiSpan('coach.rag.retrieve', { attributes: { intent: routing.intent } }, async (span) => {
          const hybridChunks = await this.deps.knowledgeService!.searchHybrid(trimmedMessage, {
            limit: 3,
            minSimilarity: 0.35,
          });

          if (hybridChunks.length > 0) {
            const ragContext = this.deps.knowledgeService!.buildRagContext(hybridChunks, {
              maxTokens: 900,
              maxChunks: 3,
              minSimilarity: 0.35,
            });
            span.setAttribute('citationsCount', ragContext.citations.length);
            candidateKnowledge = ragContext.items.map((item) => ({
              documentSlug: item.documentSlug,
              documentTitle: item.documentTitle,
              category: item.category,
              chunkIndex: item.chunkIndex,
              content: item.content,
              citation: item.citation,
            }));
          }
          span.setAttribute('returnedCount', candidateKnowledge.length);
        });
      } catch (err) {
        const errorType = err instanceof Error ? err.name : 'Error';
        // Safe fallback: log without leaking user PII or raw error details, proceed with ungrounded chat
        this.deps.logger?.warn?.(
          `[CoachRAG] Knowledge retrieval failed; falling back to ungrounded coach chat. ErrorType: ${errorType}`,
        );
        candidateKnowledge = [];
      }
    }

    // 6. Global Token Budgeting & Deterministic Waterfall Shedding (Stage 02)
    const budgeted = applyContextBudget(
      trimmedMessage,
      userContext,
      candidateHistory,
      candidateMemories,
      candidateKnowledge,
      {
        ...(input.maxHistoryTokens ? { maxHistoryTokens: input.maxHistoryTokens } : {}),
        ...input.budgets,
      },
    );

    return {
      context: budgeted.context,
      history: budgeted.history,
      memories: budgeted.memories,
      knowledge: budgeted.knowledge,
      intent: routing.intent,
      tokenStats: budgeted.tokenStats,
    };
  }
}
