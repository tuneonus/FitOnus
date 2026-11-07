/**
 * Nutrition Analytics Domain Models & Calculation Engine
 *
 * Implements pure deterministic algorithms for calorie/macro averages,
 * energy split distributions, and target adherence percentages.
 */

export interface RawMealAggregateRecord {
  date: string; // YYYY-MM-DD
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  totalFiberG: number;
  mealCount: number;
}

export interface DailyNutritionPoint {
  date: string;
  label: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  logged: boolean;
}

export interface MacroSplit {
  label: 'Protein' | 'Carbs' | 'Fat';
  pct: number;
  grams: number;
}

export interface NutritionAnalyticsSummary {
  avgCalories: number;
  targetCalories: number | null;
  avgProteinGrams: number;
  targetProteinGrams: number | null;
  avgCarbsGrams: number;
  avgFatGrams: number;
  calorieAdherencePct: number;
  proteinAdherencePct: number;
  loggedDaysCount: number;
  totalDaysInRange: number;
  macroSplit: MacroSplit[];
  dailyTrends: DailyNutritionPoint[];
}

/**
 * Calculates rolling average calories and macronutrients.
 *
 * DATA INTEGRITY RULE:
 * Unlogged days are strictly excluded from the averaging denominator.
 * A user logging 2000 kcal on 3 out of 7 days has an average intake of 2000 kcal/day,
 * NOT 857 kcal/day.
 */
export function calculateNutritionAverages(
  entries: readonly RawMealAggregateRecord[],
): {
  avgCalories: number;
  avgProtein: number;
  avgCarbs: number;
  avgFat: number;
  loggedDaysCount: number;
} {
  const loggedEntries = entries.filter((e) => e.mealCount > 0 || e.totalCalories > 0);
  const loggedDaysCount = loggedEntries.length;

  if (loggedDaysCount === 0) {
    return {
      avgCalories: 0,
      avgProtein: 0,
      avgCarbs: 0,
      avgFat: 0,
      loggedDaysCount: 0,
    };
  }

  const totalCalories = loggedEntries.reduce((sum, e) => sum + e.totalCalories, 0);
  const totalProtein = loggedEntries.reduce((sum, e) => sum + e.totalProteinG, 0);
  const totalCarbs = loggedEntries.reduce((sum, e) => sum + e.totalCarbsG, 0);
  const totalFat = loggedEntries.reduce((sum, e) => sum + e.totalFatG, 0);

  return {
    avgCalories: Math.round((totalCalories / loggedDaysCount) * 10) / 10,
    avgProtein: Math.round((totalProtein / loggedDaysCount) * 10) / 10,
    avgCarbs: Math.round((totalCarbs / loggedDaysCount) * 10) / 10,
    avgFat: Math.round((totalFat / loggedDaysCount) * 10) / 10,
    loggedDaysCount,
  };
}

/**
 * Calculates macronutrient energy contribution percentages using Atwater general factors:
 *   Protein: 4 kcal/g
 *   Carbohydrates: 4 kcal/g
 *   Fat: 9 kcal/g
 *
 * Normalized so the three percentages sum to exactly 100%.
 */
export function calculateMacroSplit(
  totalProteinG: number,
  totalCarbsG: number,
  totalFatG: number,
): MacroSplit[] {
  const proteinKcal = Math.max(0, totalProteinG) * 4;
  const carbsKcal = Math.max(0, totalCarbsG) * 4;
  const fatKcal = Math.max(0, totalFatG) * 9;
  const totalMacroKcal = proteinKcal + carbsKcal + fatKcal;

  if (totalMacroKcal <= 0) {
    return [
      { label: 'Protein', pct: 0, grams: 0 },
      { label: 'Carbs', pct: 0, grams: 0 },
      { label: 'Fat', pct: 0, grams: 0 },
    ];
  }

  const pctProtein = Math.round((proteinKcal / totalMacroKcal) * 100);
  const pctCarbs = Math.round((carbsKcal / totalMacroKcal) * 100);
  // Ensure sum equals exactly 100%
  const pctFat = Math.max(0, 100 - pctProtein - pctCarbs);

  return [
    { label: 'Protein', pct: pctProtein, grams: Math.round(totalProteinG * 10) / 10 },
    { label: 'Carbs', pct: pctCarbs, grams: Math.round(totalCarbsG * 10) / 10 },
    { label: 'Fat', pct: pctFat, grams: Math.round(totalFatG * 10) / 10 },
  ];
}

/**
 * Calculates Calorie Target Adherence Rate (% of logged days within target tolerance).
 *
 * Standard adherence band: +/- 10% of target (toleranceRatio = 0.10).
 */
export function calculateCalorieAdherence(
  entries: readonly RawMealAggregateRecord[],
  targetKcal: number | null,
  toleranceRatio: number = 0.1,
): {
  adherencePct: number;
  onTargetDays: number;
  loggedDaysCount: number;
} {
  const loggedEntries = entries.filter((e) => e.mealCount > 0 || e.totalCalories > 0);
  const loggedDaysCount = loggedEntries.length;

  if (!targetKcal || targetKcal <= 0 || loggedDaysCount === 0) {
    return { adherencePct: 0, onTargetDays: 0, loggedDaysCount };
  }

  const minAcceptable = targetKcal * (1 - toleranceRatio);
  const maxAcceptable = targetKcal * (1 + toleranceRatio);

  const onTargetDays = loggedEntries.filter(
    (e) => e.totalCalories >= minAcceptable && e.totalCalories <= maxAcceptable,
  ).length;

  const adherencePct = Math.round((onTargetDays / loggedDaysCount) * 100);

  return {
    adherencePct,
    onTargetDays,
    loggedDaysCount,
  };
}

/**
 * Calculates Protein Target Adherence Rate (% of logged days meeting at least 90% of protein target).
 */
export function calculateProteinAdherence(
  entries: readonly RawMealAggregateRecord[],
  targetProteinG: number | null,
  thresholdRatio: number = 0.9,
): {
  adherencePct: number;
  metTargetDays: number;
  loggedDaysCount: number;
} {
  const loggedEntries = entries.filter((e) => e.mealCount > 0 || e.totalCalories > 0);
  const loggedDaysCount = loggedEntries.length;

  if (!targetProteinG || targetProteinG <= 0 || loggedDaysCount === 0) {
    return { adherencePct: 0, metTargetDays: 0, loggedDaysCount };
  }

  const minAcceptable = targetProteinG * thresholdRatio;
  const metTargetDays = loggedEntries.filter((e) => e.totalProteinG >= minAcceptable).length;
  const adherencePct = Math.round((metTargetDays / loggedDaysCount) * 100);

  return {
    adherencePct,
    metTargetDays,
    loggedDaysCount,
  };
}

/**
 * Maps database aggregates into a continuous daily trend array covering every date in dateSeries.
 * Unlogged dates are marked with logged: false.
 */
export function buildDailyNutritionTrends(
  entries: readonly RawMealAggregateRecord[],
  dateSeries: readonly string[],
  weekdayLabels?: Record<string, string>,
): DailyNutritionPoint[] {
  const map = new Map<string, RawMealAggregateRecord>();
  for (const e of entries) {
    map.set(e.date, e);
  }

  return dateSeries.map((dateStr) => {
    const entry = map.get(dateStr);
    const label = weekdayLabels?.[dateStr] ?? dateStr.slice(5); // fallback MM-DD
    if (entry && (entry.mealCount > 0 || entry.totalCalories > 0)) {
      return {
        date: dateStr,
        label,
        calories: Math.round(entry.totalCalories),
        protein: Math.round(entry.totalProteinG * 10) / 10,
        carbs: Math.round(entry.totalCarbsG * 10) / 10,
        fat: Math.round(entry.totalFatG * 10) / 10,
        logged: true,
      };
    }
    return {
      date: dateStr,
      label,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      logged: false,
    };
  });
}

/**
 * Assembles full nutrition analytics summary.
 */
export function summarizeNutritionAnalytics(
  entries: readonly RawMealAggregateRecord[],
  dateSeries: readonly string[],
  targetCalories: number | null,
  targetProteinG: number | null,
  weekdayLabels?: Record<string, string>,
): NutritionAnalyticsSummary {
  const averages = calculateNutritionAverages(entries);
  const calorieAdherence = calculateCalorieAdherence(entries, targetCalories);
  const proteinAdherence = calculateProteinAdherence(entries, targetProteinG);
  const dailyTrends = buildDailyNutritionTrends(entries, dateSeries, weekdayLabels);

  const totalProtein = entries.reduce((s, e) => s + (e.totalProteinG || 0), 0);
  const totalCarbs = entries.reduce((s, e) => s + (e.totalCarbsG || 0), 0);
  const totalFat = entries.reduce((s, e) => s + (e.totalFatG || 0), 0);
  const macroSplit = calculateMacroSplit(totalProtein, totalCarbs, totalFat);

  return {
    avgCalories: averages.avgCalories,
    targetCalories,
    avgProteinGrams: averages.avgProtein,
    targetProteinGrams: targetProteinG,
    avgCarbsGrams: averages.avgCarbs,
    avgFatGrams: averages.avgFat,
    calorieAdherencePct: calorieAdherence.adherencePct,
    proteinAdherencePct: proteinAdherence.adherencePct,
    loggedDaysCount: averages.loggedDaysCount,
    totalDaysInRange: dateSeries.length,
    macroSplit,
    dailyTrends,
  };
}

