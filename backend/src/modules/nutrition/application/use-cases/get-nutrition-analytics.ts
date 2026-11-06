import { AppError } from '../../../../shared/errors/app-error.js';
import type { IMealRepository, IUserProfileTargetPort } from '../ports.js';
import type {
  DailyTrendPoint,
  MacroSplitView,
  NutritionAnalyticsView,
} from '../nutrition-view.js';

export interface GetNutritionAnalyticsInput {
  userId: string;
  range: 'week' | 'month';
  endDate?: string;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDateUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return formatDateUtc(d);
}

function generateDateSeries(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let curr = startDate;
  while (curr <= endDate) {
    dates.push(curr);
    curr = addDays(curr, 1);
  }
  return dates;
}

function getDayLabel(dateStr: string, range: 'week' | 'month'): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  if (range === 'week') {
    return WEEKDAY_NAMES[d.getUTCDay()]!;
  }
  // Month: MM/DD
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${m}/${day}`;
}

export class GetNutritionAnalyticsUseCase {
  constructor(
    private readonly mealRepo: IMealRepository,
    private readonly targetPort: IUserProfileTargetPort,
  ) {}

  async execute(input: GetNutritionAnalyticsInput): Promise<NutritionAnalyticsView> {
    if (input.range !== 'week' && input.range !== 'month') {
      throw new AppError('bad_request', 'VALIDATION_FAILED', 'Range must be "week" or "month"');
    }

    if (input.endDate && !DATE_REGEX.test(input.endDate)) {
      throw new AppError('bad_request', 'VALIDATION_FAILED', 'Invalid endDate format (must be YYYY-MM-DD)');
    }

    const totalDaysInRange = input.range === 'week' ? 7 : 28;
    const endDate = input.endDate ?? formatDateUtc(new Date());
    const startDate = addDays(endDate, -(totalDaysInRange - 1));

    const [meals, profileTargets, topFoods] = await Promise.all([
      this.mealRepo.listDateRange(input.userId, startDate, endDate),
      this.targetPort.findTargetsByUserId(input.userId),
      this.mealRepo.getMostLoggedFoods(input.userId, 5, startDate),
    ]);

    const dateSeries = generateDateSeries(startDate, endDate);
    const dayStats = new Map<string, { calories: number; protein: number; carbs: number; fat: number }>();

    for (const d of dateSeries) {
      dayStats.set(d, { calories: 0, protein: 0, carbs: 0, fat: 0 });
    }

    const loggedDates = new Set<string>();
    let totalCaloriesAll = 0;
    let totalProteinAll = 0;
    let totalCarbsAll = 0;
    let totalFatAll = 0;

    for (const meal of meals) {
      loggedDates.add(meal.date);
      const existing = dayStats.get(meal.date) ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
      existing.calories += meal.totalCalories;
      existing.protein += meal.totalProteinG;
      existing.carbs += meal.totalCarbsG;
      existing.fat += meal.totalFatG;
      dayStats.set(meal.date, existing);

      totalCaloriesAll += meal.totalCalories;
      totalProteinAll += meal.totalProteinG;
      totalCarbsAll += meal.totalCarbsG;
      totalFatAll += meal.totalFatG;
    }

    const loggedDaysCount = loggedDates.size;
    const avgCalories =
      loggedDaysCount > 0 ? Math.round((totalCaloriesAll / loggedDaysCount) * 10) / 10 : 0;
    const avgProtein =
      loggedDaysCount > 0 ? Math.round((totalProteinAll / loggedDaysCount) * 10) / 10 : 0;

    const caloriesTrend: DailyTrendPoint[] = [];
    const proteinTrend: DailyTrendPoint[] = [];

    for (const date of dateSeries) {
      const dayData = dayStats.get(date) ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
      const label = getDayLabel(date, input.range);
      caloriesTrend.push({
        date,
        label,
        value: Math.round(dayData.calories * 10) / 10,
      });
      proteinTrend.push({
        date,
        label,
        value: Math.round(dayData.protein * 10) / 10,
      });
    }

    const proteinKcal = totalProteinAll * 4;
    const carbsKcal = totalCarbsAll * 4;
    const fatKcal = totalFatAll * 9;
    const totalMacroKcal = proteinKcal + carbsKcal + fatKcal;

    let pctProtein = 0;
    let pctCarbs = 0;
    let pctFat = 0;

    if (totalMacroKcal > 0) {
      pctProtein = Math.round((proteinKcal / totalMacroKcal) * 100);
      pctCarbs = Math.round((carbsKcal / totalMacroKcal) * 100);
      pctFat = Math.max(0, 100 - pctProtein - pctCarbs);
    }

    const macroSplit: MacroSplitView[] = [
      { label: 'Protein', pct: pctProtein, grams: Math.round(totalProteinAll * 10) / 10 },
      { label: 'Carbs', pct: pctCarbs, grams: Math.round(totalCarbsAll * 10) / 10 },
      { label: 'Fat', pct: pctFat, grams: Math.round(totalFatAll * 10) / 10 },
    ];

    return {
      range: input.range,
      startDate,
      endDate,
      avgCalories,
      avgProtein,
      targetCalories: profileTargets?.dailyCalorieTarget ?? null,
      targetProtein: profileTargets?.dailyProteinGrams ?? null,
      loggedDaysCount,
      totalDaysInRange,
      caloriesTrend,
      proteinTrend,
      macroSplit,
      topFoods,
    };
  }
}

