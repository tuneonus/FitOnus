export interface LevelInfo {
  level: number;
  totalPoints: number;
  currentLevelMinPoints: number;
  nextLevelMinPoints: number;
  pointsToNextLevel: number;
  levelProgressRatio: number;
  title: string;
}

const LEVEL_TITLES: Record<number, string> = {
  1: 'Novice',
  2: 'Beginner',
  3: 'Consistent',
  4: 'Dedicated',
  5: 'Athlete',
  6: 'Veteran',
  7: 'Champion',
  8: 'Master',
};

function getLevelTitle(level: number): string {
  if (level in LEVEL_TITLES) {
    return LEVEL_TITLES[level]!;
  }
  return 'Elite';
}

/**
 * Deterministic pure function to calculate user level and progression from total earned points.
 *
 * Thresholds (V1):
 * - Level 1: 0 – 99 points (100 pt span)
 * - Level 2: 100 – 249 points (150 pt span)
 * - Level 3: 250 – 499 points (250 pt span)
 * - Level 4: 500 – 999 points (500 pt span)
 * - Level 5: 1,000 – 1,999 points (1,000 pt span)
 *
 * Level 6 and above:
 * Strictly monotonic progression: each subsequent level requires an additional 1,000 points.
 * Level L (L >= 6): [2000 + (L - 6) * 1000, 2000 + (L - 5) * 1000 - 1]
 */
export function calculateLevel(totalPoints: number): LevelInfo {
  // Validate and clamp input: prevent negative, NaN, or non-finite values
  if (!Number.isFinite(totalPoints) || totalPoints <= 0) {
    return {
      level: 1,
      totalPoints: 0,
      currentLevelMinPoints: 0,
      nextLevelMinPoints: 100,
      pointsToNextLevel: 100,
      levelProgressRatio: 0,
      title: 'Novice',
    };
  }

  const pts = Math.floor(totalPoints);

  if (pts < 100) {
    const min = 0;
    const next = 100;
    const span = next - min;
    const ratio = Math.round(((pts - min) / span) * 10000) / 10000;
    return {
      level: 1,
      totalPoints: pts,
      currentLevelMinPoints: min,
      nextLevelMinPoints: next,
      pointsToNextLevel: next - pts,
      levelProgressRatio: Math.max(0, Math.min(1, ratio)),
      title: 'Novice',
    };
  }

  if (pts < 250) {
    const min = 100;
    const next = 250;
    const span = next - min;
    const ratio = Math.round(((pts - min) / span) * 10000) / 10000;
    return {
      level: 2,
      totalPoints: pts,
      currentLevelMinPoints: min,
      nextLevelMinPoints: next,
      pointsToNextLevel: next - pts,
      levelProgressRatio: Math.max(0, Math.min(1, ratio)),
      title: 'Beginner',
    };
  }

  if (pts < 500) {
    const min = 250;
    const next = 500;
    const span = next - min;
    const ratio = Math.round(((pts - min) / span) * 10000) / 10000;
    return {
      level: 3,
      totalPoints: pts,
      currentLevelMinPoints: min,
      nextLevelMinPoints: next,
      pointsToNextLevel: next - pts,
      levelProgressRatio: Math.max(0, Math.min(1, ratio)),
      title: 'Consistent',
    };
  }

  if (pts < 1000) {
    const min = 500;
    const next = 1000;
    const span = next - min;
    const ratio = Math.round(((pts - min) / span) * 10000) / 10000;
    return {
      level: 4,
      totalPoints: pts,
      currentLevelMinPoints: min,
      nextLevelMinPoints: next,
      pointsToNextLevel: next - pts,
      levelProgressRatio: Math.max(0, Math.min(1, ratio)),
      title: 'Dedicated',
    };
  }

  if (pts < 2000) {
    const min = 1000;
    const next = 2000;
    const span = next - min;
    const ratio = Math.round(((pts - min) / span) * 10000) / 10000;
    return {
      level: 5,
      totalPoints: pts,
      currentLevelMinPoints: min,
      nextLevelMinPoints: next,
      pointsToNextLevel: next - pts,
      levelProgressRatio: Math.max(0, Math.min(1, ratio)),
      title: 'Athlete',
    };
  }

  // Level 6+ monotonic formula
  const extraLevels = Math.floor((pts - 2000) / 1000);
  const level = 6 + extraLevels;
  const min = 2000 + extraLevels * 1000;
  const next = min + 1000;
  const span = 1000;
  const ratio = Math.round(((pts - min) / span) * 10000) / 10000;

  return {
    level,
    totalPoints: pts,
    currentLevelMinPoints: min,
    nextLevelMinPoints: next,
    pointsToNextLevel: next - pts,
    levelProgressRatio: Math.max(0, Math.min(1, ratio)),
    title: getLevelTitle(level),
  };
}

