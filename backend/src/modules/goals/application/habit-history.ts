/**
 * Streaks are computed from a habit's whole completion history, not from the window a screen displays.
 * One row exists per habit per calendar day, so this covers roughly 27 years of daily completions.
 */
export const HABIT_HISTORY_SCAN_LIMIT = 10_000;
