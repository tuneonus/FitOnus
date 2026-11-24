/**
 * Context Deduplication & Untrusted Text Sanitization.
 * FitOnus Phase 08: Context Engineering — Stage 04.
 *
 * Responsibilities:
 * 1. Sanitizes untrusted strings to prevent XML tag breakout and control character injection.
 * 2. Deduplicates user memories against active profile attributes and goals.
 * 3. Enforces strict safety preservation (injury/medical memories are never dropped unless exact identical duplicate).
 */

import type { ActiveGoalContext, UserFitnessProfile } from './coach.types.js';

/**
 * Sanitizes an untrusted context string:
 * - Flattens line breaks and control characters.
 * - Neutralizes attempts to close or break our delimiter tags.
 * - Safely truncates oversized individual items to prevent context exhaustion.
 */
export function sanitizeUntrustedContextText(text: string, maxLength: number = 1000): string {
  if (!text) return '';

  const cleaned = text
    // Strip control characters (\x00-\x1F, \x7F)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, '')
    // Replace multiple whitespaces/newlines with single space
    .replace(/\s+/g, ' ')
    // Neutralize XML delimiter breakouts
    .replace(/<\/?(?:approved_memories|retrieved_knowledge|recent_dialogue|current_user_inquiry|context_manifest|system)[^>]*>/gi, '')
    .trim();

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return `${cleaned.slice(0, maxLength - 15)}... [truncated]`;
}

/**
 * Extracts normalized core value from memory string formatted as "[CATEGORY]: text"
 */
function parseMemoryCategoryAndText(memory: string): { category: string; text: string } {
  const match = memory.match(/^\[([A-Z_]+)\]:\s*(.+)$/i);
  if (match && match[1] && match[2]) {
    return {
      category: match[1].toLowerCase(),
      text: match[2].trim(),
    };
  }
  return {
    category: 'general',
    text: memory.trim(),
  };
}

/**
 * Normalizes text for fuzzy deduplication (removes punctuation, lowercases, collapses whitespace).
 */
function normalizeForComparison(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s\u0B80-\u0BFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Deduplicates approved memories against the user's active profile and active goals.
 * Preserves critical injury and medical notes.
 */
export function deduplicateContextMemories(
  memories: readonly string[],
  profile?: UserFitnessProfile | null,
  goals: readonly ActiveGoalContext[] = [],
): string[] {
  if (!memories || memories.length === 0) return [];

  const result: string[] = [];
  const seenNormalizedTexts = new Set<string>();

  // Extract normalized profile anchors for deduplication
  const p = profile || ({} as Partial<UserFitnessProfile>);
  const normalizedDiet = p.dietType ? normalizeForComparison(p.dietType) : null;
  const targetWeight = p.targetWeightKg ? String(Math.round(p.targetWeightKg)) : null;
  const normalizedGoalTitles = (goals || []).map((g) => normalizeForComparison(g.title || ''));

  for (const rawMemory of memories) {
    const sanitized = sanitizeUntrustedContextText(rawMemory, 800);
    if (!sanitized) continue;

    const { category, text } = parseMemoryCategoryAndText(sanitized);
    const normText = normalizeForComparison(text);

    // Exact duplicate within current memory set
    if (seenNormalizedTexts.has(normText)) {
      continue;
    }

    // SAFETY RULE: Injury and medical memories are essential for physical safety.
    // They are NEVER dropped via fuzzy matching against profile fields.
    const isSafetyCritical = category === 'injuries' || category === 'medical';

    if (!isSafetyCritical) {
      // 1. Check against Profile Diet Type
      if (normalizedDiet && (category === 'food' || category === 'preference')) {
        const isDietDuplicate =
          normText === normalizedDiet ||
          normText.includes(normalizedDiet) && (normText.includes('diet') || normText.includes('follows') || normText.includes('prefers'));
        if (isDietDuplicate) {
          continue;
        }
      }

      // 2. Check against Profile Target Weight
      if (targetWeight && category === 'goal') {
        const mentionsTargetWeight =
          normText.includes(`target weight ${targetWeight}`) ||
          normText.includes(`goal weight ${targetWeight}`) ||
          normText === `target weight is ${targetWeight}kg` ||
          normText === `target weight ${targetWeight} kg`;
        if (mentionsTargetWeight) {
          continue;
        }
      }

      // 3. Check against Active Goals list
      const matchesActiveGoal = normalizedGoalTitles.some(
        (gTitle) => gTitle.length > 3 && (normText === gTitle || normText.includes(gTitle)),
      );
      if (matchesActiveGoal) {
        continue;
      }
    }

    seenNormalizedTexts.add(normText);
    result.push(sanitized);
  }

  return result;
}
