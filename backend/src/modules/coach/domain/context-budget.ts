/**
 * Unified Context Token Budgeting & Deterministic Waterfall Shedding.
 * FitOnus Phase 08: Context Engineering — Stage 02.
 *
 * Responsibilities:
 * 1. Coordinates global token budget (~4,000 token envelope).
 * 2. Reuses shared Indic/Latin token estimation heuristic from history-budget.ts.
 * 3. Enforces deterministic waterfall shedding under token contention.
 * 4. Budgets both client-supplied and database-fetched history.
 * 5. Guarantees preservation of current user message, core instructions, and safety memories.
 */

import type { ChatMessageTurn, KnowledgeContextPayloadItem, UserFitnessContext } from './coach.types.js';
import { estimateTokens, selectHistoryWithinTokenBudget } from './history-budget.js';

export interface ContextTokenBudgets {
  /** Total budget envelope including model response and tool headroom (default: 4000). */
  totalEnvelope: number;
  /** Tokens reserved for Gemini response synthesis (default: 850). */
  responseReserve: number;
  /** Reserved token headroom for tool-calling multi-turn cycles (default: 400). */
  toolHeadroom: number;
  /** Maximum allowable prompt tokens sent to Python (default: 2750 = 4000 - 850 - 400). */
  maxPromptTokens: number;
  /** Maximum tokens allocated to user conversation history (default: 650). */
  maxHistoryTokens: number;
  /** Maximum dialogue turns to retain (default: 10). */
  maxHistoryTurns: number;
  /** Maximum tokens allocated to approved memories (default: 250). */
  maxMemoryTokens: number;
  /** Maximum tokens allocated to retrieved RAG knowledge (default: 800). */
  maxRagTokens: number;
}

export const DEFAULT_CONTEXT_BUDGETS: ContextTokenBudgets = {
  totalEnvelope: 4000,
  responseReserve: 850,
  toolHeadroom: 400,
  maxPromptTokens: 2750,
  maxHistoryTokens: 650,
  maxHistoryTurns: 6,
  maxMemoryTokens: 250,
  maxRagTokens: 800,
};

export interface ContextTokenStats {
  messageTokens: number;
  profileTokens: number;
  memoryTokens: number;
  ragTokens: number;
  historyTokens: number;
  systemPromptBaseTokens: number;
  totalPromptTokens: number;
  overflowOccurred: boolean;
  shedItemsCount: number;
}

export interface BudgetedContextResult {
  context: UserFitnessContext;
  history: ChatMessageTurn[];
  memories: string[];
  knowledge: KnowledgeContextPayloadItem[];
  tokenStats: ContextTokenStats;
}

/**
 * Estimates baseline tokens consumed by static system prompt rules (~450 tokens).
 */
export const ESTIMATED_SYSTEM_BASE_TOKENS = 450;

/**
 * Estimates tokens consumed by the UserFitnessContext payload.
 */
export function estimateProfileTokens(context?: UserFitnessContext | null): number {
  if (!context) return 0;
  let chars = 0;
  const p = context.profile || ({} as Partial<UserFitnessContext['profile']>);
  chars += (p.displayName || '').length + (p.primaryGoal || '').length + (p.dietType || '').length;
  chars += 120; // numeric fields estimate

  if (context.todayNutrition) {
    chars += 80;
  }
  if (context.todayPlannedWorkout) {
    chars += (context.todayPlannedWorkout.name || '').length + 40;
  }
  for (const w of context.recentWorkouts || []) {
    chars += (w?.name || '').length + 30;
  }
  for (const g of context.activeGoals || []) {
    chars += (g?.title || '').length + 20;
  }

  return estimateTokens(new Array(chars).fill('x').join(''));
}

/**
 * Budgets memories within a token and count limit.
 */
function budgetMemoriesList(memories: readonly string[], maxTokens: number, maxItems = 5): string[] {
  const result: string[] = [];
  let accumulated = 0;

  for (const mem of memories) {
    const tokens = estimateTokens(mem);
    if (result.length > 0 && accumulated + tokens > maxTokens) {
      break;
    }
    result.push(mem);
    accumulated += tokens;
    if (result.length >= maxItems) {
      break;
    }
  }

  return result;
}

/**
 * Budgets RAG knowledge items within a token and count limit.
 */
function budgetKnowledgeList(
  items: readonly KnowledgeContextPayloadItem[],
  maxTokens: number,
  maxItems = 3,
): KnowledgeContextPayloadItem[] {
  const result: KnowledgeContextPayloadItem[] = [];
  let accumulated = 0;

  for (const item of items) {
    const tokens = estimateTokens(item.content);
    if (result.length > 0 && accumulated + tokens > maxTokens) {
      break;
    }
    result.push(item);
    accumulated += tokens;
    if (result.length >= maxItems) {
      break;
    }
  }

  return result;
}

/**
 * Applies unified token budget and deterministic waterfall shedding.
 */
export function applyContextBudget(
  message: string,
  context: UserFitnessContext,
  rawHistory: ChatMessageTurn[] = [],
  rawMemories: string[] = [],
  rawKnowledge: KnowledgeContextPayloadItem[] = [],
  customBudgets: Partial<ContextTokenBudgets> = {},
): BudgetedContextResult {
  const budgets: ContextTokenBudgets = { ...DEFAULT_CONTEXT_BUDGETS, ...customBudgets };

  let shedItemsCount = 0;

  // 1. Initial component-level budgeting
  let history = selectHistoryWithinTokenBudget(rawHistory, {
    maxTokens: budgets.maxHistoryTokens,
    maxTurns: budgets.maxHistoryTurns,
  });
  if (rawHistory.length > history.length) {
    shedItemsCount += rawHistory.length - history.length;
  }

  let memories = budgetMemoriesList(rawMemories, budgets.maxMemoryTokens, 5);
  if (rawMemories.length > memories.length) {
    shedItemsCount += rawMemories.length - memories.length;
  }

  let knowledge = budgetKnowledgeList(rawKnowledge, budgets.maxRagTokens, 3);
  if (rawKnowledge.length > knowledge.length) {
    shedItemsCount += rawKnowledge.length - knowledge.length;
  }

  let effectiveContext = { ...context };

  // 2. Measure cumulative tokens
  const messageTokens = estimateTokens(message);
  let profileTokens = estimateProfileTokens(effectiveContext);
  let historyTokens = history.reduce((sum, h) => sum + estimateTokens(h.text), 0);
  let memoryTokens = memories.reduce((sum, m) => sum + estimateTokens(m), 0);
  let ragTokens = knowledge.reduce((sum, k) => sum + estimateTokens(k.content), 0);

  let totalPromptTokens =
    ESTIMATED_SYSTEM_BASE_TOKENS + messageTokens + profileTokens + historyTokens + memoryTokens + ragTokens;

  let overflowOccurred = false;

  // 3. Waterfall shedding if prompt exceeds maxPromptTokens envelope
  if (totalPromptTokens > budgets.maxPromptTokens) {
    overflowOccurred = true;

    // Stage A: Shed history turns down to minimum 2 turns
    while (history.length > 2 && totalPromptTokens > budgets.maxPromptTokens) {
      const removed = history.shift();
      if (removed) {
        shedItemsCount++;
        const tokens = estimateTokens(removed.text);
        historyTokens -= tokens;
        totalPromptTokens -= tokens;
      }
    }

    // Stage B: Drop RAG Chunk 3, then Chunk 2
    while (knowledge.length > 1 && totalPromptTokens > budgets.maxPromptTokens) {
      knowledge.pop();
      shedItemsCount++;
      ragTokens = knowledge.reduce((sum, k) => sum + estimateTokens(k.content), 0);
      totalPromptTokens =
        ESTIMATED_SYSTEM_BASE_TOKENS +
        messageTokens +
        profileTokens +
        historyTokens +
        memoryTokens +
        ragTokens;
    }

    // Stage C: Drop non-sensitive memories (keep injuries/medical)
    if (totalPromptTokens > budgets.maxPromptTokens && memories.length > 0) {
      const sensitiveOnly = memories.filter(
        (m) => m.toLowerCase().includes('[injuries]') || m.toLowerCase().includes('[medical]'),
      );
      if (sensitiveOnly.length < memories.length) {
        shedItemsCount += memories.length - sensitiveOnly.length;
        memories = sensitiveOnly;
        memoryTokens = memories.reduce((sum, m) => sum + estimateTokens(m), 0);
        totalPromptTokens =
          ESTIMATED_SYSTEM_BASE_TOKENS +
          messageTokens +
          profileTokens +
          historyTokens +
          memoryTokens +
          ragTokens;
      }
    }

    // Stage D: Condense profile (strip recent workouts and planned workout if present)
    if (totalPromptTokens > budgets.maxPromptTokens) {
      if (
        (effectiveContext.recentWorkouts && effectiveContext.recentWorkouts.length > 0) ||
        effectiveContext.todayPlannedWorkout
      ) {
        effectiveContext = {
          ...effectiveContext,
          recentWorkouts: [],
          todayPlannedWorkout: null,
        };
        shedItemsCount++;
        profileTokens = estimateProfileTokens(effectiveContext);
        totalPromptTokens =
          ESTIMATED_SYSTEM_BASE_TOKENS +
          messageTokens +
          profileTokens +
          historyTokens +
          memoryTokens +
          ragTokens;
      }
    }

    // Stage E: Drop final RAG chunk if still overflowing
    if (totalPromptTokens > budgets.maxPromptTokens && knowledge.length > 0) {
      knowledge = [];
      shedItemsCount++;
      ragTokens = 0;
      totalPromptTokens =
        ESTIMATED_SYSTEM_BASE_TOKENS +
        messageTokens +
        profileTokens +
        historyTokens +
        memoryTokens +
        ragTokens;
    }

    // Stage F: Drop history down to 1 turn if still overflowing
    if (totalPromptTokens > budgets.maxPromptTokens && history.length > 1) {
      history = history.slice(-1);
      shedItemsCount++;
      historyTokens = history.reduce((sum, h) => sum + estimateTokens(h.text), 0);
      totalPromptTokens =
        ESTIMATED_SYSTEM_BASE_TOKENS +
        messageTokens +
        profileTokens +
        historyTokens +
        memoryTokens +
        ragTokens;
    }
  }

  return {
    context: effectiveContext,
    history,
    memories,
    knowledge,
    tokenStats: {
      messageTokens,
      profileTokens,
      memoryTokens,
      ragTokens,
      historyTokens,
      systemPromptBaseTokens: ESTIMATED_SYSTEM_BASE_TOKENS,
      totalPromptTokens,
      overflowOccurred,
      shedItemsCount,
    },
  };
}
