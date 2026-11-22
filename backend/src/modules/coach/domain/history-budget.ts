import type { ChatMessageTurn } from './coach.types.js';

export interface HistoryBudgetOptions {
  /** Maximum total tokens allocated to conversation history. Default: 800 tokens (~3,200 chars). */
  maxTokens?: number;
  /** Maximum dialogue turns to include. Default: 10 turns. */
  maxTurns?: number;
}

/**
 * Estimates token count for English, Indic/Tamil, and mixed Tanglish text.
 * - Latin script: ~4 characters per token.
 * - Indic/Tamil script (\u0B80-\u0BFF) and wider Unicode: ~1.5 characters per token.
 * - Adds 4 tokens of structural turn overhead (role + formatting tags).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  let latinChars = 0;
  let nonLatinChars = 0;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // Tamil Unicode block: \u0B80 to \u0BFF. Other extended non-ASCII >= 128.
    if ((code >= 0x0b80 && code <= 0x0bff) || code > 0x07f) {
      nonLatinChars++;
    } else {
      latinChars++;
    }
  }

  const tokenEstimate = Math.ceil(latinChars / 4) + Math.ceil(nonLatinChars / 1.5) + 4;
  return Math.max(1, tokenEstimate);
}

/**
 * Selects the most recent conversation messages within a configured token and turn budget.
 *
 * Incoming messages MUST be provided in chronological order (oldest -> newest).
 * The algorithm iterates backwards from the newest message to prioritize recent context,
 * accumulating tokens until the budget is exhausted, then restores chronological order.
 *
 * @param messages Eligible candidate turns in chronological order
 * @param options Budget configuration (maxTokens, maxTurns)
 * @returns Filtered turns in chronological order
 */
export function selectHistoryWithinTokenBudget(
  messages: Array<{ role: 'user' | 'assistant'; text: string }>,
  options: HistoryBudgetOptions = {},
): ChatMessageTurn[] {
  const maxTokens = options.maxTokens ?? 800;
  const maxTurns = options.maxTurns ?? 10;

  if (!messages || messages.length === 0) return [];

  const selectedReversed: ChatMessageTurn[] = [];
  let accumulatedTokens = 0;

  // Walk backwards from newest to oldest
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || !m.text || !m.text.trim()) continue;

    const tokens = estimateTokens(m.text);

    // If adding this turn exceeds budget and we already have at least one turn, stop
    if (selectedReversed.length > 0 && accumulatedTokens + tokens > maxTokens) {
      break;
    }

    selectedReversed.push({
      role: m.role,
      text: m.text,
    });
    accumulatedTokens += tokens;

    if (selectedReversed.length >= maxTurns) {
      break;
    }
  }

  // Restore chronological order (oldest to newest)
  return selectedReversed.reverse();
}
