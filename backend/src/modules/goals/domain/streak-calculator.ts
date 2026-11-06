/**
 * Pure deterministic habit streak calculation engine.
 * Computes current streak and longest streak across daily and weekly frequencies.
 */

export interface StreakResult {
  currentStreak: number;
  longestStreak: number;
  totalCompletions: number;
}

function parseDateUtc(dateStr: string): number {
  const parts = dateStr.split('-').map(Number);
  const year = parts[0] ?? 1970;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  return Date.UTC(year, month - 1, day);
}

function formatDateUtc(timestampMs: number): string {
  const d = new Date(timestampMs);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Calculates daily habit streak from unique completion dates.
 * 
 * Rules:
 * - If today is completed: streak includes today and counts backward consecutive days.
 * - If today is pending, but yesterday was completed: streak is preserved (active) and counts backward from yesterday.
 * - If neither today nor yesterday was completed: current streak is 0.
 * - Longest streak is the maximum consecutive calendar days found across all history.
 */
export function calculateDailyStreak(completionDates: string[], referenceDateStr?: string): StreakResult {
  if (completionDates.length === 0) {
    return { currentStreak: 0, longestStreak: 0, totalCompletions: 0 };
  }

  // Deduplicate and sort timestamps ascending
  const uniqueDateStrings = Array.from(new Set(completionDates)).sort();
  const totalCompletions = uniqueDateStrings.length;

  const dateSet = new Set(uniqueDateStrings);

  const refDate = referenceDateStr ?? formatDateUtc(Date.now());
  const refTimestamp = parseDateUtc(refDate);

  const todayStr = refDate;
  const yesterdayStr = formatDateUtc(refTimestamp - ONE_DAY_MS);

  // 1. Calculate Current Streak
  let currentStreak = 0;
  let checkTimestamp: number | null = null;

  if (dateSet.has(todayStr)) {
    checkTimestamp = refTimestamp;
  } else if (dateSet.has(yesterdayStr)) {
    checkTimestamp = refTimestamp - ONE_DAY_MS;
  }

  if (checkTimestamp !== null) {
    while (dateSet.has(formatDateUtc(checkTimestamp))) {
      currentStreak++;
      checkTimestamp -= ONE_DAY_MS;
    }
  }

  // 2. Calculate Longest Streak
  let longestStreak = 0;
  let runningStreak = 0;
  let previousTimestamp: number | null = null;

  for (const dateStr of uniqueDateStrings) {
    const currentTs = parseDateUtc(dateStr);
    if (previousTimestamp === null) {
      runningStreak = 1;
    } else if (currentTs - previousTimestamp === ONE_DAY_MS) {
      runningStreak++;
    } else {
      runningStreak = 1;
    }
    if (runningStreak > longestStreak) {
      longestStreak = runningStreak;
    }
    previousTimestamp = currentTs;
  }

  if (currentStreak > longestStreak) {
    longestStreak = currentStreak;
  }

  return {
    currentStreak,
    longestStreak,
    totalCompletions,
  };
}

/**
 * Calculates weekly habit streak from completion dates.
 * A week qualifies if distinct completion days in that ISO calendar week >= targetDaysPerWeek.
 */
export function calculateWeeklyStreak(
  completionDates: string[],
  targetDaysPerWeek: number,
  referenceDateStr?: string,
): StreakResult {
  if (completionDates.length === 0) {
    return { currentStreak: 0, longestStreak: 0, totalCompletions: 0 };
  }

  const uniqueDates = Array.from(new Set(completionDates)).sort();
  const totalCompletions = uniqueDates.length;

  // Group dates by ISO week key (e.g. "2026-W45")
  const weekMap = new Map<string, number>();
  for (const dateStr of uniqueDates) {
    const weekKey = getIsoWeekKey(dateStr);
    weekMap.set(weekKey, (weekMap.get(weekKey) ?? 0) + 1);
  }

  const refDate = referenceDateStr ?? formatDateUtc(Date.now());
  const currentWeekKey = getIsoWeekKey(refDate);
  const previousWeekKey = getPreviousIsoWeekKey(refDate);

  // Check which weeks qualified
  const qualifiedWeeks = new Set<string>();
  for (const [wKey, count] of weekMap.entries()) {
    if (count >= targetDaysPerWeek) {
      qualifiedWeeks.add(wKey);
    }
  }

  // 1. Calculate Current Streak
  let currentStreak = 0;
  let weekCursor: string | null = null;

  if (qualifiedWeeks.has(currentWeekKey)) {
    weekCursor = currentWeekKey;
  } else if (qualifiedWeeks.has(previousWeekKey)) {
    // Current week is still in progress and not yet disqualified
    weekCursor = previousWeekKey;
  }

  if (weekCursor !== null) {
    while (qualifiedWeeks.has(weekCursor)) {
      currentStreak++;
      weekCursor = getPreviousIsoWeekKeyFromKey(weekCursor);
    }
  }

  // 2. Calculate Longest Streak
  // Sort all unique qualified weeks chronologically
  const sortedQualifiedWeeks = Array.from(qualifiedWeeks).sort();
  let longestStreak = 0;
  let runningStreak = 0;
  let prevWeek: string | null = null;

  for (const wKey of sortedQualifiedWeeks) {
    if (prevWeek === null) {
      runningStreak = 1;
    } else if (isConsecutiveIsoWeek(prevWeek, wKey)) {
      runningStreak++;
    } else {
      runningStreak = 1;
    }
    if (runningStreak > longestStreak) {
      longestStreak = runningStreak;
    }
    prevWeek = wKey;
  }

  if (currentStreak > longestStreak) {
    longestStreak = currentStreak;
  }

  return {
    currentStreak,
    longestStreak,
    totalCompletions,
  };
}

// --- ISO Calendar Week Helpers ---

function getIsoWeekDetails(dateStr: string): { year: number; week: number } {
  const parts = dateStr.split('-').map(Number);
  const year = parts[0] ?? 1970;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const d = new Date(Date.UTC(year, month - 1, day));
  // Set to nearest Thursday: current date + 4 - current day number
  // Make Sunday's day number 7
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week: weekNo };
}

function getIsoWeekKey(dateStr: string): string {
  const { year, week } = getIsoWeekDetails(dateStr);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function getPreviousIsoWeekKey(dateStr: string): string {
  const ts = parseDateUtc(dateStr) - 7 * ONE_DAY_MS;
  return getIsoWeekKey(formatDateUtc(ts));
}

function getPreviousIsoWeekKeyFromKey(weekKey: string): string {
  const [yStr, wStr] = weekKey.split('-W');
  let y = Number(yStr);
  let w = Number(wStr);
  if (w > 1) {
    return `${y}-W${String(w - 1).padStart(2, '0')}`;
  }
  // Previous year's last week
  y -= 1;
  const dec28 = `${y}-12-28`;
  return getIsoWeekKey(dec28);
}

function isConsecutiveIsoWeek(prevKey: string, nextKey: string): boolean {
  return getPreviousIsoWeekKeyFromKey(nextKey) === prevKey;
}
