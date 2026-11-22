import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  selectHistoryWithinTokenBudget,
} from '../../../src/modules/coach/domain/history-budget.js';

describe('History Budget and Token Estimation', () => {
  it('estimates tokens for empty string and short Latin text', () => {
    expect(estimateTokens('')).toBe(0);
    // "Hello coach" (11 chars) -> ceil(11/4) + 4 = 3 + 4 = 7
    expect(estimateTokens('Hello coach')).toBe(7);
  });

  it('accounts for Tamil Unicode script token density', () => {
    const englishText = 'I have knee pain when doing heavy squats today'; // 46 chars
    const tamilText = 'எனக்கு முழங்கால் வலி இருக்கிறது'; // 31 chars in Tamil script

    const englishTokens = estimateTokens(englishText);
    const tamilTokens = estimateTokens(tamilText);

    // Tamil should estimate higher per-character density than pure English
    expect(tamilTokens).toBeGreaterThan(Math.ceil(tamilText.length / 4) + 4);
    expect(englishTokens).toBeGreaterThan(0);
  });

  it('selects newest turns within budget and preserves chronological order', () => {
    const turns: Array<{ role: 'user' | 'assistant'; text: string }> = [
      { role: 'user', text: 'Turn 1 - ancient question' },
      { role: 'assistant', text: 'Turn 2 - ancient answer' },
      { role: 'user', text: 'Turn 3 - middle question' },
      { role: 'assistant', text: 'Turn 4 - middle answer' },
      { role: 'user', text: 'Turn 5 - recent question' },
      { role: 'assistant', text: 'Turn 6 - recent answer' },
    ];

    // Restrict maxTurns to 2
    const budgeted = selectHistoryWithinTokenBudget(turns, { maxTurns: 2 });
    expect(budgeted).toHaveLength(2);
    // Must be Turn 5 and Turn 6 in ascending chronological order!
    expect(budgeted[0]!.text).toBe('Turn 5 - recent question');
    expect(budgeted[1]!.text).toBe('Turn 6 - recent answer');
  });

  it('truncates older messages when token limit is exceeded', () => {
    const turns: Array<{ role: 'user' | 'assistant'; text: string }> = [
      { role: 'user', text: 'Turn 1: ' + 'A'.repeat(200) }, // ~54 tokens
      { role: 'assistant', text: 'Turn 2: ' + 'B'.repeat(200) }, // ~54 tokens
      { role: 'user', text: 'Turn 3: ' + 'C'.repeat(40) }, // ~14 tokens
      { role: 'assistant', text: 'Turn 4: ' + 'D'.repeat(40) }, // ~14 tokens
    ];

    // Set maxTokens to 40 (only Turn 4 and Turn 3 can fit, Turn 2 would exceed)
    const budgeted = selectHistoryWithinTokenBudget(turns, { maxTokens: 40 });
    expect(budgeted).toHaveLength(2);
    expect(budgeted[0]!.text).toContain('Turn 3');
    expect(budgeted[1]!.text).toContain('Turn 4');
  });

  it('handles empty message lists gracefully', () => {
    expect(selectHistoryWithinTokenBudget([])).toEqual([]);
  });
});
